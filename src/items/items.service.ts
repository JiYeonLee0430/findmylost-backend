import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemStatus, ItemType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/current-user.decorator';
import { S3Service } from './s3.service';

export interface CreateItemInput {
  title: string;
  type: ItemType;
  category: string;
  locationLat: number;
  locationLng: number;
  storageLocation?: string;
}

@Injectable()
export class ItemsService {
  constructor(private prisma: PrismaService, private s3: S3Service) {}

  async create(user: AuthUser, input: CreateItemInput) {
    const isOrg = user.role === Role.ORG_ADMIN;
    if (input.storageLocation && !(isOrg && input.type === ItemType.FOUND)) {
      throw new ForbiddenException('보관 장소는 기관 계정의 습득물에만 입력할 수 있습니다.');
    }
    return this.prisma.item.create({
      data: {
        ...input,
        authorId: user.id,
        institutionId: isOrg ? user.institutionId : null,
      },
    });
  }

  private async assertCanManage(user: AuthUser, itemId: number) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException();
    const isAuthor = item.authorId === user.id;
    const isSameOrgAdmin =
      user.role === Role.ORG_ADMIN && item.institutionId !== null && item.institutionId === user.institutionId;
    if (!isAuthor && !isSameOrgAdmin) throw new ForbiddenException('권한이 없습니다.');
    return item;
  }

  async updateStatus(user: AuthUser, itemId: number, status: ItemStatus) {
    await this.assertCanManage(user, itemId);
    return this.prisma.item.update({ where: { id: itemId }, data: { status } });
  }

  async createUploadUrl(user: AuthUser, itemId: number, filename: string, contentType: string) {
    await this.assertCanManage(user, itemId);
    if (!contentType.startsWith('image/')) throw new BadRequestException('이미지 파일만 업로드할 수 있습니다.');
    return this.s3.createUploadUrl(itemId, filename, contentType);
  }

  async registerImage(user: AuthUser, itemId: number, s3Key: string) {
    await this.assertCanManage(user, itemId);
    if (!s3Key.startsWith(`items/${itemId}/`)) throw new BadRequestException('잘못된 S3 key입니다.');
    return this.prisma.itemImage.create({ data: { itemId, s3Key } });
  }

  async remove(user: AuthUser, itemId: number) {
    await this.assertCanManage(user, itemId);
    const images = await this.prisma.itemImage.findMany({ where: { itemId }, select: { s3Key: true } });
    await this.prisma.item.delete({ where: { id: itemId } });
    try {
      await this.s3.deleteObjects(images.map((i) => i.s3Key));
    } catch (e) {
      console.error(`S3 삭제 실패 item=${itemId}`, e);
    }
    return { ok: true };
  }
}