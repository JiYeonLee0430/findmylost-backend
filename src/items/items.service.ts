import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemStatus, ItemType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/current-user.decorator';
import { S3Service } from './s3.service';
import { ListItemsQueryDto } from './items-query.dto';
import { MapItemsQueryDto } from './items-map-query.dto';

export interface CreateItemInput {
  title: string;
  type: ItemType;
  category: string;
  locationLat: number;
  locationLng: number;
  storageLocation?: string;
}

export interface UpdateItemInput {
  title?: string;
  category?: string;
  locationLat?: number;
  locationLng?: number;
  storageLocation?: string | null;
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
        author: { select: { name: true } },
        institution: { select: { id: true, name: true } },
        images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, s3Key: true } },
      },
    });
    if (!item) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    const { images, authorId, ...rest } = item;
    const imageUrls = await Promise.all(images.map((i) => this.s3.createDownloadUrl(i.s3Key)));
    return {
      ...rest,
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

    // 보관 장소는 기관 계정이 올린 습득물에서만 입력 가능 (null로 지우는 건 항상 허용)
    if (input.storageLocation) {
      const canSetStorage =
        user.role === Role.ORG_ADMIN && item.type === ItemType.FOUND && item.institutionId !== null;
      if (!canSetStorage) {
        throw new ForbiddenException('보관 장소는 기관 계정의 습득물에만 입력할 수 있습니다.');
      }
    }

    return this.prisma.item.update({
      where: { id: itemId },
      data: {
        title: input.title,
        category: input.category,
        locationLat: input.locationLat,
        locationLng: input.locationLng,
        storageLocation: input.storageLocation,
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