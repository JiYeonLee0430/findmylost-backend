import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { maskNames } from '../common/mask-name.util';
import { ListPublicItemsQueryDto } from './public-items-query.dto';

/** 우리 분류 선택지 → 공공 분류("대분류 > 소분류") 매핑 */
const CATEGORY_RULES: Record<string, { mains?: string[]; contains?: string[] }> = {
  전자기기: { mains: ['전자기기', '휴대폰'] },
  '지갑/카드': { mains: ['지갑', '카드', '증명서'] },
  귀중품: { mains: ['귀금속', '현금'] },
  가방: { mains: ['가방', '쇼핑백'] },
  의류: { mains: ['의류'] },
  우산: { contains: ['우산'] },
};
const KNOWN_MAINS = Object.values(CATEGORY_RULES).flatMap((r) => r.mains ?? []);

const LIST_SELECT = {
  id: true, name: true, category: true, foundDate: true,
  storagePlace: true, imageUrl: true, region: true,
} satisfies Prisma.PublicItemSelect;

type ListRow = Prisma.PublicItemGetPayload<{ select: typeof LIST_SELECT }>;

@Injectable()
export class PublicItemsService {
  constructor(private prisma: PrismaService) {}

  private categoryWhere(category: string): Prisma.PublicItemWhereInput {
    const rule = CATEGORY_RULES[category];
    if (rule) {
      return {
        OR: [
          ...(rule.mains ?? []).map((m) => ({ category: { startsWith: m } })),
          ...(rule.contains ?? []).map((c) => ({ category: { contains: c } })),
        ],
      };
    }
    if (category === '기타') {
      return {
        OR: [
          { category: null },
          {
            NOT: [
              ...KNOWN_MAINS.map((m) => ({ category: { startsWith: m } })),
              { category: { contains: '우산' } },
            ],
          },
        ],
      };
    }
    return { category: { startsWith: category } }; // 공공 대분류를 직접 보낸 경우
  }

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
        { foundDate: { gte: from, ...(q.to && { lte: new Date(q.to) }) } },
        ...(q.region ? [{ region: q.region }] : []),
        ...(q.keyword ? [{ name: { contains: q.keyword, mode: 'insensitive' as const } }] : []),
        ...(q.category ? [this.categoryWhere(q.category)] : []),
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
      select: { ...LIST_SELECT, atcId: true, content: true, institutionName: true, phone: true },
    });
    if (!r) throw new NotFoundException('공공 습득물을 찾을 수 없습니다.');
    const { atcId, content, institutionName, phone, ...rest } = r;
    return {
      ...this.toListItem(rest),
      atcId,
      content: maskNames(content),
      institutionName,
      phone,
    };
  }
}