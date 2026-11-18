import { Injectable } from '@nestjs/common';
import { ItemStatus, ItemType, Prisma } from '@prisma/client';
import type { AuthUser } from '../common/current-user.decorator';
import { maskNames } from '../common/mask-name.util';
import { PrismaService } from '../prisma/prisma.service';
import { publicCategoryWhere } from '../public-items/public-category';
import { S3Service } from './s3.service';
import { FeedQueryDto } from './feed-query.dto';

interface Card {
  source: 'internal' | 'public';
  id: number;
  title: string | null;
  category: string | null;
  date: string | null;
  place: string | null;
  institution: string | null;
  thumbnailUrl: string | null;
  sortAt: number;
  s3Key?: string;
  region: string | null;
}

@Injectable()
export class FeedService {
  constructor(private prisma: PrismaService, private s3: S3Service) {}

  async feed(user: AuthUser | null, q: FeedQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const offset = (page - 1) * limit;
    const take = offset + limit; // 합친 뒤 자르기 위해 양쪽에서 이만큼 가져온다
    const source = q.source ?? 'all';

    const internalWhere: Prisma.ItemWhereInput = {
      type: ItemType.FOUND,
      status: ItemStatus.OPEN,
      ...(q.category && { category: q.category }),
      ...(q.keyword && { title: { contains: q.keyword, mode: 'insensitive' } }),
      ...(q.region && { region: q.region }),
    };
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const publicWhere: Prisma.PublicItemWhereInput = {
      AND: [
        { foundDate: { gte: since } },
        ...(q.keyword ? [{ name: { contains: q.keyword, mode: 'insensitive' as const } }] : []),
        ...(q.category ? [publicCategoryWhere(q.category)] : []),
        ...(q.region ? [{ region: q.region }] : []), // ★ 공공 습득물도 지역으로 거름
      ],
    };

    const loadInternal = async (): Promise<[number, Card[]]> => {
      if (source === 'public') return [0, []];
      const [total, rows] = await Promise.all([
        this.prisma.item.count({ where: internalWhere }),
        this.prisma.item.findMany({
          where: internalWhere,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          select: {
            id: true, title: true, category: true, createdAt: true, storageLocation: true,
            region: true, // ★
            institution: { select: { name: true } },
            images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: 1, select: { s3Key: true } },
          },
        }),
      ]);
      return [
        total,
        rows.map((r) => ({
          source: 'internal' as const,
          id: r.id,
          title: r.title,
          category: r.category,
          date: r.createdAt.toISOString().slice(0, 10),
          place: user ? r.storageLocation : null, // 비로그인은 가림
          institution: r.institution?.name ?? null,
          thumbnailUrl: null,
          region: r.region, // ★
          sortAt: r.createdAt.getTime(),
          s3Key: r.images[0]?.s3Key,
        })),
      ];
    };

    const loadPublic = async (): Promise<[number, Card[]]> => {
      if (source === 'internal') return [0, []];
      const [total, rows] = await Promise.all([
        this.prisma.publicItem.count({ where: publicWhere }),
        this.prisma.publicItem.findMany({
          where: publicWhere,
          orderBy: [{ foundDate: 'desc' }, { id: 'desc' }],
          take,
          select: {
            id: true, name: true, category: true, foundDate: true, storagePlace: true, imageUrl: true,
            region: true, // ★
          },
        }),
      ]);
      return [
        total,
        rows.map((r) => ({
          source: 'public' as const,
          id: r.id,
          title: maskNames(r.name),
          category: (r.category ?? '').split(' > ')[0] || null,
          date: r.foundDate ? r.foundDate.toISOString().slice(0, 10) : null,
          place: r.storagePlace,
          institution: null,
          thumbnailUrl: r.imageUrl,
          region: r.region, // ★
          sortAt: r.foundDate?.getTime() ?? 0,
        })),
      ];
    };

    const [[iTotal, iCards], [pTotal, pCards]] = await Promise.all([loadInternal(), loadPublic()]);

    const merged = [...iCards, ...pCards].sort(
      (a, b) => b.sortAt - a.sortAt || (a.source === b.source ? b.id - a.id : a.source === 'internal' ? -1 : 1),
    );
    const pageCards = merged.slice(offset, offset + limit);

    // 사진 주소(서명 URL)는 이번 페이지에 나가는 우리 글만 만든다
    const items = await Promise.all(
      pageCards.map(async ({ sortAt, s3Key, ...c }) => ({
        ...c,
        thumbnailUrl: s3Key ? ((await this.s3.createDownloadUrl(s3Key)) ?? null) : c.thumbnailUrl,
      })),
    );
    return { items, total: iTotal + pTotal, page, limit };
  }
}