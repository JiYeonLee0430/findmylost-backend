import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemNote, NoteScope, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/current-user.decorator';
import { CreateNoteDto } from './notes.dto';

type NoteWithAuthor = ItemNote & { author: { name: string } };

@Injectable()
export class NotesService {
  constructor(private prisma: PrismaService) {}

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
}