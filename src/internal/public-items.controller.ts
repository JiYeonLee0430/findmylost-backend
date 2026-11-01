import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
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

/** "이미지 없음" 그림 주소(no_img)는 사진 없음으로 처리 */
const cleanImageUrl = (u?: string) => (u && !/no_img/i.test(u) ? u : null);

@SkipThrottle() // Lambda 내부 API는 IP 요청 제한에서 제외
@ApiExcludeController()
@UseGuards(InternalApiKeyGuard)
@Controller('internal/public-items')
export class PublicItemsInternalController {
  constructor(private prisma: PrismaService) {}

  @Post('bulk')
  @HttpCode(200)
  async bulkUpsert(@Body() dto: BulkPublicItemsDto) {
    const ops = dto.items.map(({ foundDate, raw, imageUrl, ...i }) => {
      const data = {
        ...i,
        imageUrl: cleanImageUrl(imageUrl),
        foundDate: parseYmd(foundDate),
        raw: (raw ?? {}) as Prisma.InputJsonObject,
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