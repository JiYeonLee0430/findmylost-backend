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

  @IsOptional() @IsString() @MaxLength(512)
  s3Key?: string;

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
    if (dto.s3Key && !dto.s3Key.startsWith(`items/${id}/`)) {
      throw new BadRequestException('s3Key가 게시글 ID와 맞지 않습니다.');
    }
    const vec = `[${dto.embedding.join(',')}]`;
    const updated = await this.prisma.$executeRaw`
      UPDATE "Item" SET "imageVector" = ${vec}::vector WHERE id = ${id}
    `;
    if (updated === 0) throw new NotFoundException('게시글을 찾을 수 없습니다.');
    return { ok: true };
  }
}