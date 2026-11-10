import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/current-user.decorator';
import { S3Service } from '../items/s3.service';

const PAGE = 50;

/** "이지연" → "이*연", "홍길" → "홍*" */
function maskName(name: string) {
  if (name.length <= 1) return name;
  if (name.length === 2) return `${name[0]}*`;
  return `${name[0]}${'*'.repeat(name.length - 2)}${name[name.length - 1]}`;
}

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService, private s3: S3Service) {}

  /** 대화방 참여자인지 확인하고, 내가 문의자(starter)인지 글쓴이(owner)인지 돌려줌 */
  private async getMyConversation(user: AuthUser, conversationId: number) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('대화방을 찾을 수 없습니다.');
    if (conv.starterId !== user.id && conv.ownerId !== user.id) {
      throw new ForbiddenException('이 대화방에 접근할 수 없습니다.');
    }
    return { conv, myRole: conv.starterId === user.id ? ('starter' as const) : ('owner' as const) };
  }

  /** 작성자에게 문의하기: 대화방을 만들거나 기존 방을 돌려줌 */
  async startConversation(user: AuthUser, itemId: number) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId }, select: { authorId: true, status: true } });
    if (!item) throw new NotFoundException('게시글을 찾을 수 없습니다.');
    if (item.authorId === user.id) throw new BadRequestException('내 글에는 문의할 수 없습니다.');
    if (!user.emailVerified) throw new ForbiddenException('이메일 인증 후 문의할 수 있습니다.');

    const key = { itemId_starterId: { itemId, starterId: user.id } };
    const existing = await this.prisma.conversation.findUnique({ where: key });
    if (existing) return { conversationId: existing.id, created: false };

    if (item.status !== ItemStatus.OPEN) throw new BadRequestException('진행 중인 글에만 문의할 수 있습니다.');

    try {
      const conv = await this.prisma.conversation.create({
        data: { itemId, starterId: user.id, ownerId: item.authorId },
      });
      return { conversationId: conv.id, created: true };
    } catch (e) {
      // 동시에 두 번 눌러서 이미 만들어진 경우
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const conv = await this.prisma.conversation.findUniqueOrThrow({ where: key });
        return { conversationId: conv.id, created: false };
      }
      throw e;
    }
  }

  /** 대화방별 안 읽은 메시지 수 (상대가 보냈고, 내가 마지막으로 읽은 시각 이후) */
  private async unreadByConversation(userId: number) {
    const rows = await this.prisma.$queryRaw<{ id: number; n: number }[]>`
      SELECT m."conversationId" AS id, count(*)::int AS n
      FROM "Message" m
      JOIN "Conversation" c ON c.id = m."conversationId"
      WHERE m."senderId" <> ${userId}
        AND (
          (c."starterId" = ${userId} AND m."createdAt" > c."starterLastReadAt")
          OR (c."ownerId" = ${userId} AND m."createdAt" > c."ownerLastReadAt")
        )
      GROUP BY m."conversationId"
    `;
    return new Map(rows.map((r) => [r.id, r.n]));
  }

  async unreadCount(user: AuthUser) {
    const map = await this.unreadByConversation(user.id);
    let total = 0;
    map.forEach((n) => (total += n));
    return { unread: total };
  }

  /** 내 대화 목록 (최근 대화 순, 최대 50개) */
  async listConversations(user: AuthUser) {
    const convs = await this.prisma.conversation.findMany({
      where: { OR: [{ starterId: user.id }, { ownerId: user.id }] },
      orderBy: { lastMessageAt: 'desc' },
      take: PAGE,
      include: {
        item: {
          select: {
            id: true, title: true, type: true, status: true,
            institution: { select: { name: true } },
            images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: 1, select: { s3Key: true } },
          },
        },
        starter: { select: { name: true } },
        owner: { select: { name: true } },
        messages: { orderBy: { id: 'desc' }, take: 1, select: { content: true, senderId: true, createdAt: true } },
      },
    });
    const unread = await this.unreadByConversation(user.id);

    return Promise.all(
      convs.map(async (c) => {
        const myRole = c.starterId === user.id ? 'starter' : 'owner';
        // 내가 문의자면 상대는 글쓴이(기관 글이면 기관 이름), 내가 글쓴이면 상대는 문의자
        const counterpartName =
          myRole === 'starter' ? (c.item.institution?.name ?? maskName(c.owner.name)) : maskName(c.starter.name);
        const last = c.messages[0];
        const img = c.item.images[0];
        return {
          conversationId: c.id,
          myRole,
          counterpartName,
          item: {
            id: c.item.id,
            title: c.item.title,
            type: c.item.type,
            status: c.item.status,
            thumbnailUrl: img ? await this.s3.createDownloadUrl(img.s3Key) : null,
          },
          lastMessage: last
            ? { content: last.content.slice(0, 100), isMine: last.senderId === user.id, createdAt: last.createdAt }
            : null,
          unreadCount: unread.get(c.id) ?? 0,
          lastMessageAt: c.lastMessageAt,
        };
      }),
    );
  }

  /** 읽음 처리: 내가 마지막으로 읽은 시각을 지금으로 */
  async markRead(user: AuthUser, conversationId: number) {
    const { myRole } = await this.getMyConversation(user, conversationId);
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: myRole === 'starter' ? { starterLastReadAt: new Date() } : { ownerLastReadAt: new Date() },
    });
    return { ok: true };
  }

  /** 메시지 불러오기: 기본은 최근 50개, after면 그 뒤 새 메시지, before면 그 앞 예전 메시지 */
  async getMessages(user: AuthUser, conversationId: number, q: { after?: number; before?: number }) {
    const { conv, myRole } = await this.getMyConversation(user, conversationId);

    let rows;
    if (q.after !== undefined) {
      rows = await this.prisma.message.findMany({
        where: { conversationId, id: { gt: q.after } },
        orderBy: { id: 'asc' },
        take: 100,
      });
    } else {
      rows = (
        await this.prisma.message.findMany({
          where: { conversationId, ...(q.before !== undefined && { id: { lt: q.before } }) },
          orderBy: { id: 'desc' },
          take: PAGE,
        })
      ).reverse();
    }

    if (q.before === undefined) await this.markRead(user, conversationId); // 최신 메시지를 봤으면 읽음 처리

    return {
      conversationId,
      itemId: conv.itemId,
      myRole,
      messages: rows.map((m) => ({
        id: m.id,
        content: m.content,
        isMine: m.senderId === user.id,
        createdAt: m.createdAt,
      })),
    };
  }

  /** 메시지 보내기: 저장 후, 실시간 전송에 필요한 참여자 정보까지 돌려줌 */
  async sendMessage(user: AuthUser, conversationId: number, content: string) {
    const { conv, myRole } = await this.getMyConversation(user, conversationId);
    const now = new Date();

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({ data: { conversationId, senderId: user.id, content } }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: now,
          ...(myRole === 'starter' ? { starterLastReadAt: now } : { ownerLastReadAt: now }),
        },
      }),
    ]);

    return {
      message: { id: message.id, conversationId, senderId: user.id, content: message.content, createdAt: message.createdAt },
      participantIds: [conv.starterId, conv.ownerId],
    };
  }
}