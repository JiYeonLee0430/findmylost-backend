import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ItemStatus, ItemType } from '@prisma/client';
import { REGIONS, toShortRegion } from '../common/region.util';

export class ListItemsQueryDto {
  @ApiPropertyOptional({ enum: ItemType })
  @IsOptional() @IsEnum(ItemType)
  type?: ItemType;

  @ApiPropertyOptional({ enum: ItemStatus, description: '기본값 OPEN' })
  @IsOptional() @IsEnum(ItemStatus)
  status?: ItemStatus;

  @ApiPropertyOptional({ example: '지갑' })
  @IsOptional() @IsString() @MaxLength(50)
  category?: string;

  @ApiPropertyOptional({ description: '제목 검색어' })
  @IsOptional() @IsString() @MaxLength(50)
  keyword?: string;

  @ApiPropertyOptional({ example: '충남', description: '시/도 짧은 이름 (긴 이름 충청남도도 받음)' })
  @IsOptional() @Transform(({ value }) => toShortRegion(value)) @IsIn(REGIONS)
  region?: string;

  @ApiPropertyOptional({ description: '특정 기관의 게시글만' })
  @IsOptional() @Type(() => Number) @IsInt()
  institutionId?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit?: number;
}