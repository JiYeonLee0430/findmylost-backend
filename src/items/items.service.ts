import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ItemStatus, ItemType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/current-user.decorator';
import { S3Service } from './s3.service';
import { ListItemsQueryDto } from './items-query.dto';
import { MapItemsQueryDto } from './items-map-query.dto';
import { SimilarItemsQueryDto } from './items-similar-query.dto';
import { BedrockService } from './bedrock.service';
import { SearchByImageDto } from './items-image-search.dto';
import type { UploadedImage } from './items-image-search.dto';
import { ManageItemsQueryDto } from './items-mine-query.dto';

const MAX_IMAGES = 5;

export interface CreateItemInput {
  title: string;
  type: ItemType;
  category: string;
  locationLat: number;
  locationLng: number;
  storageLocation?: string;
  lostLocation?: string;
  content?: string;  
  region?: string;
}

export interface UpdateItemInput {
  title?: string;
  category?: string;
  locationLat?: number;
  locationLng?: number;
  storageLocation?: string | null;
  lostLocation?: string | null;
  content?: string | null;
  region?: string | null;
}

@Injectable()
export class ItemsService {
  private imageSearchLog = new Map<number, number[]>(); // 사용자별 최근 검색 시각 (서버 한 대 기준)

  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
    private bedrock: BedrockService,
  ) {}

  async create(user: AuthUser, input: CreateItemInput) {
    const isOrg = user.role === Role.ORG_ADMIN;
    // 보관 장소는 습득물(FOUND)에만 입력 가능 (일반 계정도 가능)
    if (input.storageLocation && input.type !== ItemType.FOUND) {
      throw new BadRequestException('보관 장소는 습득물에만 입력할 수 있습니다.');
    }
    if (input.lostLocation && input.type !== ItemType.LOST) {
      throw new BadRequestException('분실 장소는 분실물에만 입력할 수 있습니다.');
    }
    return this.prisma.item.create({
      data: {
        ...input,
        authorId: user.id,
        institutionId: isOrg ? user.institutionId : null,
      },
    });
  }

  /** 목록 조회: 비로그인도 가능, 보관 장소는 로그인 사용자에게만 */
  async list(user: AuthUser | null, q: ListItemsQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;

    const where: Prisma.ItemWhereInput = {
      status: q.status ?? ItemStatus.OPEN,
      ...(q.type && { type: q.type }),
      ...(q.category && { category: q.category }),
      ...(q.institutionId && { institutionId: q.institutionId }),
      ...(q.keyword && { title: { contains: q.keyword, mode: 'insensitive' } }),
      ...(q.region && { region: q.region }),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.item.count({ where }),
      this.prisma.item.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          type: true,
          category: true,
          status: true,
          locationLat: true,
          locationLng: true,
          storageLocation: true,
          createdAt: true,
          lostLocation: true,
          region: true,
          institution: { select: { id: true, name: true } },
          images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: 1, select: { s3Key: true } },
        },
      }),
    ]);

    const items = await Promise.all(
      rows.map(async ({ images, ...item }) => ({
        ...item,
        storageLocation: user ? item.storageLocation : null, // 비로그인은 가림
        thumbnailUrl: images[0] ? await this.s3.createDownloadUrl(images[0].s3Key) : null,
      })),
    );
    return { items, total, page, limit };
  }

    /** 지도용 조회: 영역(minLat~maxLng) 또는 반경(lat, lng, radiusKm)으로 가벼운 마커 정보만 */
    async mapItems(user: AuthUser | null, q: MapItemsQueryDto) {
      const hasBox = [q.minLat, q.maxLat, q.minLng, q.maxLng].every((v) => v !== undefined);
      const hasCircle = q.lat !== undefined && q.lng !== undefined;
  
      if (!hasBox && !hasCircle) {
        throw new BadRequestException('영역(minLat, maxLat, minLng, maxLng) 또는 중심(lat, lng)을 보내주세요.');
      }
  
      let latMin: number, latMax: number, lngMin: number, lngMax: number;
      if (hasBox) {
        if (q.minLat! > q.maxLat! || q.minLng! > q.maxLng!) {
          throw new BadRequestException('영역의 최솟값은 최댓값보다 클 수 없습니다.');
        }
        [latMin, latMax, lngMin, lngMax] = [q.minLat!, q.maxLat!, q.minLng!, q.maxLng!];
      } else {
        // 반경을 사각 영역으로 먼저 줄이고, 아래에서 실제 거리로 다시 걸러냄
        const radius = q.radiusKm ?? 3;
        const dLat = radius / 111;
        const dLng = radius / (111 * Math.max(Math.cos((q.lat! * Math.PI) / 180), 0.01));
        [latMin, latMax, lngMin, lngMax] = [q.lat! - dLat, q.lat! + dLat, q.lng! - dLng, q.lng! + dLng];
      }
  
      const rows = await this.prisma.item.findMany({
        where: {
          status: q.status ?? ItemStatus.OPEN,
          locationLat: { gte: latMin, lte: latMax },
          locationLng: { gte: lngMin, lte: lngMax },
          ...(q.type && { type: q.type }),
          ...(q.category && { category: q.category }),
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          title: true,
          type: true,
          category: true,
          status: true,
          locationLat: true,
          locationLng: true,
          storageLocation: true,
          createdAt: true,
          institution: { select: { id: true, name: true } },
        },
      });
  
      // 반경 조회면 실제 거리를 계산해서 원 밖은 제거하고 가까운 순으로 정렬
      const withDistance = rows.map((r) => ({
        ...r,
        storageLocation: user ? r.storageLocation : null, // 비로그인은 가림
        distanceKm: hasCircle && !hasBox ? this.distanceKm(q.lat!, q.lng!, r.locationLat, r.locationLng) : null,
      }));
  
      if (hasCircle && !hasBox) {
        const radius = q.radiusKm ?? 3;
        const items = withDistance
          .filter((r) => r.distanceKm! <= radius)
          .sort((a, b) => a.distanceKm! - b.distanceKm!)
          .map((r) => ({ ...r, distanceKm: Math.round(r.distanceKm! * 100) / 100 }));
        return { items, count: items.length };
      }
      return { items: withDistance, count: withDistance.length };
    }
  
    /** 두 좌표 사이의 거리(km), 하버사인 공식 */
    private distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a =
        Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
      return 6371 * 2 * Math.asin(Math.sqrt(a));
    }
  
  /** 비슷한 글: 내 글의 사진들과 상대 글의 사진들을 모두 비교해서 가장 높은 유사도를 글 점수로 사용 */
  async similar(user: AuthUser | null, itemId: number, q: SimilarItemsQueryDto) {
    const limit = q.limit ?? 10;

    const src = await this.prisma.item.findUnique({ where: { id: itemId }, select: { type: true } });
    if (!src) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    // 등록된 사진 중 AI 분석(벡터)이 끝난 게 하나라도 있는지
    const ready = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n
      FROM "ImageEmbedding" e
      JOIN "ItemImage" i ON i."s3Key" = e."s3Key"
      WHERE i."itemId" = ${itemId}
    `;
    if (ready[0].n === 0) return { ready: false, items: [] }; // 사진 분석이 아직 안 끝남

    const targetType = src.type === ItemType.LOST ? ItemType.FOUND : ItemType.LOST;
    const typeFilter =
      (q.scope ?? 'opposite') === 'opposite'
        ? Prisma.sql`AND t.type = ${targetType}::"ItemType"`
        : Prisma.empty;
    const minFilter =
      q.minSimilarity !== undefined
        ? Prisma.sql`HAVING MAX(1 - (te.vector <=> se.vector)) >= ${q.minSimilarity}`
        : Prisma.empty;

    const hits = await this.prisma.$queryRaw<{ id: number; similarity: number }[]>`
      WITH se AS (
        SELECT e.vector
        FROM "ImageEmbedding" e
        JOIN "ItemImage" i ON i."s3Key" = e."s3Key"
        WHERE i."itemId" = ${itemId}
      )
      SELECT t.id, MAX(1 - (te.vector <=> se.vector))::float8 AS similarity
      FROM "Item" t
      JOIN "ItemImage" ti ON ti."itemId" = t.id
      JOIN "ImageEmbedding" te ON te."s3Key" = ti."s3Key"
      CROSS JOIN se
      WHERE t.id <> ${itemId}
        AND t.status = 'OPEN'::"ItemStatus"
        ${typeFilter}
      GROUP BY t.id
      ${minFilter}
      ORDER BY similarity DESC
      LIMIT ${limit}
    `;

    return { ready: true, items: await this.hydrateHits(user, hits) };
  }

    /** 사진으로 검색: 업로드한 사진의 임베딩과 게시글들의 임베딩을 코사인 거리로 비교 */
    async searchByImage(user: AuthUser, file: UploadedImage | undefined, q: SearchByImageDto) {
      if (!file) throw new BadRequestException('사진 파일(file)을 보내주세요.');
      if (!this.isJpegOrPng(file.buffer)) {
        throw new BadRequestException('JPEG 또는 PNG 이미지만 검색할 수 있습니다.');
      }
      this.checkImageSearchLimit(user.id);
  
      const embedding = await this.bedrock.embedImage(file.buffer);
      const vec = `[${embedding.join(',')}]`; // Bedrock이 준 숫자 배열만 문자열로 만들고, 쿼리에는 파라미터로 전달
  
      const limit = q.limit ?? 10;
      const target = q.target ?? 'FOUND';
      const typeFilter = target === 'ALL' ? Prisma.empty : Prisma.sql`AND t.type = ${target}::"ItemType"`;
      const minFilter =
        q.minSimilarity !== undefined
          ? Prisma.sql`HAVING MAX(1 - (te.vector <=> ${vec}::vector)) >= ${q.minSimilarity}`
          : Prisma.empty;
  
      // 올린 사진과 모든 등록 사진을 비교하고, 글마다 가장 높은 유사도를 점수로 사용
      const hits = await this.prisma.$queryRaw<{ id: number; similarity: number }[]>`
        SELECT t.id, MAX(1 - (te.vector <=> ${vec}::vector))::float8 AS similarity
        FROM "Item" t
        JOIN "ItemImage" ti ON ti."itemId" = t.id
        JOIN "ImageEmbedding" te ON te."s3Key" = ti."s3Key"
        WHERE t.status = 'OPEN'::"ItemStatus"
          ${typeFilter}
        GROUP BY t.id
        ${minFilter}
        ORDER BY similarity DESC
        LIMIT ${limit}
      `;
  
      return { items: await this.hydrateHits(user, hits) };
    }
  
    /** 유사도 결과(id, similarity)에 게시글 정보와 썸네일을 붙임 (유사도 순서 유지) */
    private async hydrateHits(user: AuthUser | null, hits: { id: number; similarity: number }[]) {
      if (hits.length === 0) return [];
      const rows = await this.prisma.item.findMany({
        where: { id: { in: hits.map((h) => h.id) } },
        select: {
          id: true,
          title: true,
          type: true,
          category: true,
          status: true,
          locationLat: true,
          locationLng: true,
          storageLocation: true,
          lostLocation: true, // 분실 장소 (분실물만 값이 있음)
          createdAt: true,
          institution: { select: { id: true, name: true } },
          images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: 1, select: { s3Key: true } },
        },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
  
      return Promise.all(
        hits
          .filter((h) => byId.has(h.id))
          .map(async (h) => {
            const { images, ...item } = byId.get(h.id)!;
            return {
              ...item,
              storageLocation: user ? item.storageLocation : null,
              similarity: Math.round(h.similarity * 1000) / 1000,
              thumbnailUrl: images[0] ? await this.s3.createDownloadUrl(images[0].s3Key) : null,
            };
          }),
      );
    }
  
    /** 확장자나 Content-Type이 아니라 파일 앞부분으로 JPEG/PNG인지 확인 */
    private isJpegOrPng(b: Buffer) {
      const jpeg = b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
      const png =
        b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      return jpeg || png;
    }
  
    /** 사용자당 1분에 10회 (비용 보호용, 서버가 여러 대면 대수만큼 늘어남) */
    private checkImageSearchLimit(userId: number) {
      const now = Date.now();
      const recent = (this.imageSearchLog.get(userId) ?? []).filter((t) => now - t < 60_000);
      if (recent.length >= 10) {
        throw new HttpException('이미지 검색 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', HttpStatus.TOO_MANY_REQUESTS);
      }
      recent.push(now);
      this.imageSearchLog.set(userId, recent);
    }
  /** 내가 올린 게시글 (상태 무관) */
  async listMine(user: AuthUser, q: ManageItemsQueryDto) {
    return this.listManaged({ authorId: user.id }, q);
  }

  /** 우리 기관 게시글 전체 (기관 관리자 전용) */
  async listOrg(user: AuthUser, q: ManageItemsQueryDto) {
    if (user.role !== Role.ORG_ADMIN || user.institutionId === null) {
      throw new ForbiddenException('기관 관리자만 조회할 수 있습니다.');
    }
    return this.listManaged({ institutionId: user.institutionId }, q);
  }

  private async listManaged(base: Prisma.ItemWhereInput, q: ManageItemsQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const where: Prisma.ItemWhereInput = {
      ...base,
      ...(q.type && { type: q.type }),
      ...(q.status && { status: q.status }),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.item.count({ where }),
      this.prisma.item.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          type: true,
          category: true,
          status: true,
          locationLat: true,
          locationLng: true,
          storageLocation: true,
          createdAt: true,
          author: { select: { name: true } },
          institution: { select: { id: true, name: true } },
          images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: 1, select: { s3Key: true } },
        },
      }),
    ]);

    const items = await Promise.all(
      rows.map(async ({ images, ...item }) => ({
        ...item,
        thumbnailUrl: images[0] ? await this.s3.createDownloadUrl(images[0].s3Key) : null,
      })),
    );
    return { items, total, page, limit };
  }

  /** 상세 조회: 비로그인도 가능, 보관 장소는 로그인 사용자에게만 */
  async detail(user: AuthUser | null, itemId: number) {
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        title: true,
        type: true,
        category: true,
        status: true,
        locationLat: true,
        locationLng: true,
        storageLocation: true,
        createdAt: true,
        authorId: true,
        content: true,
        lostLocation: true,
        region: true,
        author: { select: { name: true } },
        institution: { select: { id: true, name: true } },
        images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, s3Key: true } },
      },
    });
    if (!item) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    const { images, authorId, ...rest } = item;
    const imageList = await Promise.all(
      images.map(async (i) => ({ id: i.id, url: await this.s3.createDownloadUrl(i.s3Key) })),
    );
    const imageUrls = imageList.map((i) => i.url);
    return {
      ...rest,
      images: imageList.filter((i): i is { id: number; url: string } => !!i.url),
      storageLocation: user ? rest.storageLocation : null, // 비로그인은 가림
      isMine: user ? authorId === user.id : false,
      imageUrls: imageUrls.filter((u): u is string => !!u),
    };
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

  async update(user: AuthUser, itemId: number, input: UpdateItemInput) {
    const item = await this.assertCanManage(user, itemId);

    if (Object.values(input).every((v) => v === undefined)) {
      throw new BadRequestException('수정할 항목을 보내주세요.');
    }

    // 보관 장소는 습득물(FOUND)에만 입력 가능 (null로 지우는 건 항상 허용)
    if (input.storageLocation && item.type !== ItemType.FOUND) {
      throw new BadRequestException('보관 장소는 습득물에만 입력할 수 있습니다.');
    }
    if (input.lostLocation && item.type !== ItemType.LOST) {
      throw new BadRequestException('분실 장소는 분실물에만 입력할 수 있습니다.');
    }
    

    return this.prisma.item.update({
      where: { id: itemId },
      data: {
        title: input.title,
        category: input.category,
        locationLat: input.locationLat,
        locationLng: input.locationLng,
        storageLocation: input.storageLocation,
        lostLocation: input.lostLocation, 
        region: input.region,
        content: input.content,
      },
      select: {
        id: true,
        title: true,
        type: true,
        category: true,
        status: true,
        locationLat: true,
        locationLng: true,
        storageLocation: true,
        createdAt: true,
        lostLocation: true,
        content: true,
        region: true,
      },
    });
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

    /** 사진 등록: 글당 최대 5장. 같은 사진을 다시 등록하면 기존 것을 그대로 돌려줌 */
  async registerImage(user: AuthUser, itemId: number, s3Key: string) {
      await this.assertCanManage(user, itemId);
      if (!s3Key.startsWith(`items/${itemId}/`)) throw new BadRequestException('잘못된 S3 key입니다.');
  
      const existing = await this.prisma.itemImage.findFirst({ where: { itemId, s3Key } });
      if (existing) return existing;
  
      const count = await this.prisma.itemImage.count({ where: { itemId } });
      if (count >= MAX_IMAGES) {
        throw new BadRequestException(`사진은 최대 ${MAX_IMAGES}장까지 등록할 수 있습니다.`);
      }
      return this.prisma.itemImage.create({ data: { itemId, s3Key, sortOrder: count } });
    }
    /** 사진 1장 삭제: DB 사진 + AI 벡터 + S3 파일 */
  async removeImage(user: AuthUser, itemId: number, imageId: number) {
      await this.assertCanManage(user, itemId);
      const img = await this.prisma.itemImage.findFirst({ where: { id: imageId, itemId } });
      if (!img) throw new NotFoundException('사진을 찾을 수 없습니다.');
  
      await this.prisma.$transaction([
        this.prisma.itemImage.delete({ where: { id: imageId } }),
        this.prisma.$executeRaw`DELETE FROM "ImageEmbedding" WHERE "s3Key" = ${img.s3Key}`,
      ]);
      try {
        await this.s3.deleteObjects([img.s3Key]);
      } catch (e) {
        console.error(`사진 파일 삭제 실패 item=${itemId} image=${imageId}`, e);
      }
      return { ok: true };
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