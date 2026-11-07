import {
  BadRequestException, Body, Controller, HttpCode, NotFoundException,
  Param, ParseIntPipe, Post, UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, MaxLength,
} from 'class-validator';
import { InternalApiKeyGuard } from '../common/internal-api-key.guard';
import { PrismaService } from '../prisma/prisma.service';

const EMBEDDING_DIM = 1024;

class EmbeddingDto {
  @IsArray()
  @ArrayMinSize(EMBEDDING_DIM)
  @ArrayMaxSize(EMBEDDING_DIM)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { each: true })
  embedding: number[];

  @IsString() @MaxLength(512)
  s3Key: string; // 어떤 사진의 벡터인지 (필수)

  @IsOptional() @IsString() @MaxLength(100)
  model?: string;
}

@SkipThrottle() // Lambda 내부 API는 IP 요청 제한에서 제외
@ApiExcludeController()
@UseGuards(InternalApiKeyGuard)
@Controller('internal/items')
export class InternalController {
  constructor(private prisma: PrismaService) {}

  @Post(':id/embedding')
  @HttpCode(200)
  async saveEmbedding(@Param('id', ParseIntPipe) id: number, @Body() dto: EmbeddingDto) {
    if (!dto.s3Key.startsWith(`items/${id}/`)) {
      throw new BadRequestException('s3Key가 게시글 ID와 맞지 않습니다.');
    }
    const item = await this.prisma.item.findUnique({ where: { id }, select: { id: true } });
    if (!item) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    const vec = `[${dto.embedding.join(',')}]`;

    // 사진(s3Key)마다 벡터 1개. 같은 사진이 다시 오면 갱신
    await this.prisma.$executeRaw`
      INSERT INTO "ImageEmbedding" ("itemId", "s3Key", "vector", "model", "createdAt", "updatedAt")
      VALUES (${id}, ${dto.s3Key}, ${vec}::vector, ${dto.model ?? null}, now(), now())
      ON CONFLICT ("s3Key") DO UPDATE
        SET "vector" = EXCLUDED."vector", "model" = EXCLUDED."model", "updatedAt" = now()
    `;

    // 전환 기간 호환용: 검색 쿼리를 바꾸기 전까지 기존 칸도 갱신 (4단계 이후 삭제 예정)
    await this.prisma.$executeRaw`UPDATE "Item" SET "imageVector" = ${vec}::vector WHERE id = ${id}`;

    return { ok: true };
  }
}