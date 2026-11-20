import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemNote, NoteScope, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/current-user.decorator';
import { maskNames } from '../common/mask-name.util';
import { S3Service } from '../items/s3.service';
import { CreateNoteDto, CreatePublicNoteDto, MyNotesQueryDto } from './notes.dto';

type NoteWithAuthor = ItemNote & { author: { name: string } };

@Injectable()
export class NotesService {
  constructor(private prisma: PrismaService, private s3: S3Service) {}

  private async getItem(itemId: number) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId }, select: { id: true, institutionId: true } });
    if (!item) throw new NotFoundException('게시글을 찾을 수 없습니다.');
    return item;
  }

  /** 이 글의 기관 관리자인지: 기관 관리자이고, 그 글이 내 기관이 등록한 글 */
  private isInstitutionAdmin(user: AuthUser, item: { institutionId: number | null }) {
    return user.role === Role.ORG_ADMIN && user.institutionId != null && item.institutionId === user.institutionId;
  }

  /** 화면에 내려줄 메모 모양. 기관 메모에만 작성자 이름 표시 */
  private toNote(n: NoteWithAuthor, userId: number) {
    return {
      id: n.id,
      scope: n.scope,
      content: n.content,
      isMine: n.authorId === userId,
      ...(n.scope === NoteScope.INSTITUTION && { authorName: n.author.name }),
      createdAt: n.createdAt,
    };
  }

  /** 내 개인 메모 + (이 글의 기관 관리자면) 기관 메모, 최신순 */
  async list(user: AuthUser, itemId: number) {
    const item = await this.getItem(itemId);
    const canInstitution = this.isInstitutionAdmin(user, item);

    const notes = await this.prisma.itemNote.findMany({
      where: {
        itemId,
        OR: [
          { scope: NoteScope.PRIVATE, authorId: user.id },
          ...(canInstitution ? [{ scope: NoteScope.INSTITUTION }] : []),
        ],
      },
      orderBy: { id: 'desc' },
      include: { author: { select: { name: true } } },
    });

    return {
      canWriteInstitution: canInstitution, // 프론트가 "기관 메모" 탭/버튼을 보여줄지 판단
      private: notes.filter((n) => n.scope === NoteScope.PRIVATE).map((n) => this.toNote(n, user.id)),
      institution: notes.filter((n) => n.scope === NoteScope.INSTITUTION).map((n) => this.toNote(n, user.id)),
    };
  }

  async create(user: AuthUser, itemId: number, dto: CreateNoteDto) {
    const item = await this.getItem(itemId);
    if (dto.scope === NoteScope.INSTITUTION && !this.isInstitutionAdmin(user, item)) {
      throw new ForbiddenException('기관 메모는 그 글을 등록한 기관의 관리자만 작성할 수 있습니다.');
    }
    const note = await this.prisma.itemNote.create({
      data: { itemId, authorId: user.id, scope: dto.scope, content: dto.content },
      include: { author: { select: { name: true } } },
    });
    return this.toNote(note, user.id);
  }

  /** 내가 쓴 메모만 삭제. 볼 권한이 없는 메모는 존재 자체를 숨김(404) */
  async remove(user: AuthUser, itemId: number, noteId: number) {
    const note = await this.prisma.itemNote.findFirst({ where: { id: noteId, itemId } });
    if (!note) throw new NotFoundException('메모를 찾을 수 없습니다.');

    if (note.authorId !== user.id) {
      if (note.scope === NoteScope.PRIVATE) throw new NotFoundException('메모를 찾을 수 없습니다.');
      const item = await this.getItem(itemId);
      if (!this.isInstitutionAdmin(user, item)) throw new NotFoundException('메모를 찾을 수 없습니다.');
      throw new ForbiddenException('내가 쓴 메모만 삭제할 수 있습니다.');
    }

    await this.prisma.itemNote.delete({ where: { id: noteId } });
    return { ok: true };
  }

  // ───────── 경찰청 습득물(PublicItem) 메모: 개인 메모만 ─────────

  private async getPublicItem(publicItemId: number) {
    const p = await this.prisma.publicItem.findUnique({ where: { id: publicItemId }, select: { id: true } });
    if (!p) throw new NotFoundException('습득물을 찾을 수 없습니다.');
    return p;
  }

  /** 내 개인 메모만, 최신순. 응답 모양은 우리 글 메모와 같게 맞춤 */
  async listPublic(user: AuthUser, publicItemId: number) {
    await this.getPublicItem(publicItemId);
    const notes = await this.prisma.itemNote.findMany({
      where: { publicItemId, authorId: user.id, scope: NoteScope.PRIVATE },
      orderBy: { id: 'desc' },
      include: { author: { select: { name: true } } },
    });
    return {
      canWriteInstitution: false,
      private: notes.map((n) => this.toNote(n, user.id)),
      institution: [],
    };
  }

  async createPublic(user: AuthUser, publicItemId: number, dto: CreatePublicNoteDto) {
    await this.getPublicItem(publicItemId);
    const note = await this.prisma.itemNote.create({
      data: { publicItemId, authorId: user.id, scope: NoteScope.PRIVATE, content: dto.content },
      include: { author: { select: { name: true } } },
    });
    return this.toNote(note, user.id);
  }

  /** 내 메모만 삭제. 남의 메모는 존재 자체를 숨김(404) */
  async removePublic(user: AuthUser, publicItemId: number, noteId: number) {
    const note = await this.prisma.itemNote.findFirst({ where: { id: noteId, publicItemId } });
    if (!note || note.authorId !== user.id) throw new NotFoundException('메모를 찾을 수 없습니다.');
    await this.prisma.itemNote.delete({ where: { id: noteId } });
    return { ok: true };
  }

    // ───────── 내 메모 모아보기 (마이페이지) ─────────

  /** 내가 쓴 메모 전체: 우리 글 + 경찰청 습득물, 최신순 */
  async myNotes(user: AuthUser, q: MyNotesQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const where: Prisma.ItemNoteWhereInput = {
      authorId: user.id,
      ...(q.scope && { scope: q.scope }),
      ...(q.source === 'internal' && { itemId: { not: null } }),
      ...(q.source === 'public' && { publicItemId: { not: null } }),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.itemNote.count({ where }),
      this.prisma.itemNote.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, scope: true, content: true, createdAt: true,
          item: {
            select: {
              id: true, title: true, type: true, status: true, storageLocation: true, createdAt: true,
              images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: 1, select: { s3Key: true } },
            },
          },
          publicItem: { select: { id: true, name: true, storagePlace: true, imageUrl: true, foundDate: true } },
        },
      }),
    ]);

    const items = await Promise.all(
      rows.map(async (n) => {
        let target = null;
        if (n.item) {
          const key = n.item.images[0]?.s3Key;
          target = {
            source: 'internal' as const,
            id: n.item.id,
            title: n.item.title,
            type: n.item.type,
            status: n.item.status,
            place: n.item.storageLocation,
            date: n.item.createdAt.toISOString().slice(0, 10),
            thumbnailUrl: key ? ((await this.s3.createDownloadUrl(key)) ?? null) : null,
          };
        } else if (n.publicItem) {
          target = {
            source: 'public' as const,
            id: n.publicItem.id,
            title: maskNames(n.publicItem.name),
            type: 'FOUND' as const,
            status: null,
            place: n.publicItem.storagePlace,
            date: n.publicItem.foundDate ? n.publicItem.foundDate.toISOString().slice(0, 10) : null,
            thumbnailUrl: n.publicItem.imageUrl,
          };
        }
        return { id: n.id, scope: n.scope, content: n.content, createdAt: n.createdAt, target };
      }),
    );
    return { items, total, page, limit };
  }
}