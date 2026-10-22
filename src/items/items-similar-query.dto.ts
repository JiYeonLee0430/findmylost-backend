import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class SimilarItemsQueryDto {
  @ApiPropertyOptional({ default: 10, maximum: 20, description: '가져올 개수' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20)
  limit?: number;

  @ApiPropertyOptional({
    enum: ['opposite', 'all'],
    default: 'opposite',
    description: 'opposite: 반대 유형만 (분실물이면 습득물) / all: 전체',
  })
  @IsOptional() @IsIn(['opposite', 'all'])
  scope?: 'opposite' | 'all';

  @ApiPropertyOptional({ example: 0.5, description: '이 값 이상으로 비슷한 것만 (0~1). 기준값은 실제 데이터로 정해야 합니다' })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1)
  minSimilarity?: number;
}