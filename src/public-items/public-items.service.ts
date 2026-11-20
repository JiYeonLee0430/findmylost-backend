import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { maskNames } from '../common/mask-name.util';
import { ListPublicItemsQueryDto } from './public-items-query.dto';
import { publicCategoryWhere } from './public-category';
import { isListed, publicFreshWhere } from './public-fresh.util';

const LIST_SELECT = {
  id: true, name: true, category: true, foundDate: true,
  storagePlace: true, imageUrl: true, region: true,
} satisfies Prisma.PublicItemSelect;

type ListRow = Prisma.PublicItemGetPayload<{ select: typeof LIST_SELECT }>;

@Injectable()
export class PublicItemsService {
  constructor(private prisma: PrismaService) {}

  private toListItem(r: ListRow) {
    const [main, sub] = (r.category ?? '').split(' > ');
    return {
      id: r.id,
      source: 'public' as const,
      name: maskNames(r.name),
      categoryMain: main || null,
      categorySub: sub || null,
      foundDate: r.foundDate ? r.foundDate.toISOString().slice(0, 10) : null,
      storagePlace: r.storagePlace,
      imageUrl: r.imageUrl,
      region: r.region,
    };
  }

  async list(q: ListPublicItemsQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const where: Prisma.PublicItemWhereInput = {
      AND: [
        publicFreshWhere(),
        { foundDate: { gte: from, ...(q.to && { lte: new Date(q.to) }) } },
        ...(q.region ? [{ region: q.region }] : []),
        ...(q.keyword ? [{ name: { contains: q.keyword, mode: 'insensitive' as const } }] : []),
        ...(q.category ? [publicCategoryWhere(q.category)] : []),
      ],
    };
    const orderBy = [{ foundDate: 'desc' as const }, { id: 'desc' as const }];
    const offset = (page - 1) * limit;
    const total = await this.prisma.publicItem.count({ where });

    let rows: ListRow[];
    if (!q.photoFirst) {
      rows = await this.prisma.publicItem.findMany({ where, orderBy, skip: offset, take: limit, select: LIST_SELECT });
    } else {
      // 사진 있는 항목을 먼저, 그다음 사진 없는 항목 (각각 최신순)
      const withImg: Prisma.PublicItemWhereInput = { AND: [where, { imageUrl: { not: null } }] };
      const noImg: Prisma.PublicItemWhereInput = { AND: [where, { imageUrl: null }] };
      const imgCount = await this.prisma.publicItem.count({ where: withImg });
      rows = offset < imgCount
        ? await this.prisma.publicItem.findMany({ where: withImg, orderBy, skip: offset, take: limit, select: LIST_SELECT })
        : [];
      const remain = limit - rows.length;
      if (remain > 0) {
        const more = await this.prisma.publicItem.findMany({
          where: noImg, orderBy, skip: Math.max(0, offset - imgCount), take: remain, select: LIST_SELECT,
        });
        rows = rows.concat(more);
      }
    }
    return { items: rows.map((r) => this.toListItem(r)), total, page, limit };
  }

  async detail(id: number) {
    const r = await this.prisma.publicItem.findUnique({
      where: { id },
      select: { ...LIST_SELECT, atcId: true, content: true, institutionName: true, phone: true, lastSyncedAt: true },
    });
    if (!r) throw new NotFoundException('공공 습득물을 찾을 수 없습니다.');
    const { atcId, content, institutionName, phone, lastSyncedAt, ...rest } = r;
    return {
      ...this.toListItem(rest),
      atcId,
      content: maskNames(content),
      institutionName,
      phone,
      listed: isListed(lastSyncedAt), // false면 "경찰청 목록에서 내려간 물건(이미 찾아갔을 수 있음)"
    };
  }
}