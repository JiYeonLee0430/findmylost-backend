import { Body, Controller, Get, HttpCode, Logger, OnModuleInit, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, Max, Min, ValidateNested,
} from 'class-validator';
import { ApiExcludeController } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { SkipThrottle } from '@nestjs/throttler';
import { InternalApiKeyGuard } from '../common/internal-api-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import { BulkPublicItemsDto } from './public-items.dto';

/** "2025-11-01" 또는 "20251101" → Date. 형식이 이상하면 null */
function parseYmd(s?: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

const EMBEDDING_DIM = 1024;

class PublicEmbeddingDto {
  @IsInt() @Min(1)
  id: number;

  @IsOptional() @IsArray() @ArrayMinSize(EMBEDDING_DIM) @ArrayMaxSize(EMBEDDING_DIM)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { each: true })
  embedding?: number[];

  @IsOptional() @IsIn(['ok', 'failed'])
  status?: 'ok' | 'failed';
}

class PublicEmbeddingsBodyDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => PublicEmbeddingDto)
  items: PublicEmbeddingDto[];
}

class EmbeddingTargetsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
}

/** "이미지 없음" 그림 주소(no_img)는 사진 없음으로 처리 */
const cleanImageUrl = (u?: string) => (u && !/no_img/i.test(u) ? u : null);

@SkipThrottle() // Lambda 내부 API는 IP 요청 제한에서 제외
@ApiExcludeController()
@UseGuards(InternalApiKeyGuard)
@Controller('internal/public-items')
export class PublicItemsInternalController implements OnModuleInit {
  private logger = new Logger(PublicItemsInternalController.name);
  constructor(private prisma: PrismaService) {}

  /** 마이그레이션을 아직 안 돌린 DB에서도 동작하도록 벡터 테이블이 없으면 만든다 */
  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "PublicItemEmbedding" (
          "publicItemId" INTEGER NOT NULL,
          "vector" vector(1024),
          "status" TEXT NOT NULL DEFAULT 'ok',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "PublicItemEmbedding_pkey" PRIMARY KEY ("publicItemId"),
          CONSTRAINT "PublicItemEmbedding_publicItemId_fkey" FOREIGN KEY ("publicItemId")
            REFERENCES "PublicItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )`);
    } catch (e) {
      this.logger.error(`PublicItemEmbedding 테이블 준비 실패: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** 아직 벡터가 없는 사진 있는 공공 습득물 (최근 습득일 순). Lambda가 가져가서 임베딩 */
  @Get('embedding-targets')
  async embeddingTargets(@Query() q: EmbeddingTargetsQueryDto) {
    const limit = q.limit ?? 100;
    const rows = await this.prisma.$queryRaw<{ id: number; imageUrl: string }[]>`
      SELECT p.id, p."imageUrl"
      FROM "PublicItem" p
      LEFT JOIN "PublicItemEmbedding" e ON e."publicItemId" = p.id
      WHERE p."imageUrl" IS NOT NULL AND e."publicItemId" IS NULL
      ORDER BY p."foundDate" DESC NULLS LAST, p.id DESC
      LIMIT ${limit}
    `;
    return { items: rows };
  }

  /** 공공 습득물 사진 벡터 저장. embedding이 없으면 failed로 기록해 다시 시도하지 않음 */
  @Post('embeddings')
  @HttpCode(200)
  async saveEmbeddings(@Body() dto: PublicEmbeddingsBodyDto) {
    let saved = 0;
    for (const it of dto.items) {
      const ok = Array.isArray(it.embedding) && it.status !== 'failed';
      const vec = ok ? `[${it.embedding!.join(',')}]` : null;
      const n = await this.prisma.$executeRaw`
        INSERT INTO "PublicItemEmbedding" ("publicItemId", "vector", "status", "createdAt")
        SELECT ${it.id}, ${vec}::vector, ${ok ? 'ok' : 'failed'}, now()
        WHERE EXISTS (SELECT 1 FROM "PublicItem" WHERE id = ${it.id})
        ON CONFLICT ("publicItemId") DO UPDATE
          SET "vector" = EXCLUDED."vector", "status" = EXCLUDED."status", "createdAt" = now()
      `;
      saved += n;
    }
    return { saved };
  }

  @Post('bulk')
  @HttpCode(200)
  async bulkUpsert(@Body() dto: BulkPublicItemsDto) {
    const syncedAt = new Date(); // 이번 수집에 잡힌 시각
    const ops = dto.items.map(({ foundDate, raw, imageUrl, ...i }) => {
      const data = {
        ...i,
        imageUrl: cleanImageUrl(imageUrl),
        foundDate: parseYmd(foundDate),
        raw: (raw ?? {}) as Prisma.InputJsonObject,
        lastSyncedAt: syncedAt,
      };
      return this.prisma.publicItem.upsert({
        where: { atcId_fdSn: { atcId: i.atcId, fdSn: i.fdSn } },
        create: data,
        update: data,
      });
    });
    await this.prisma.$transaction(ops);
    return { upserted: ops.length };
  }
}