import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ItemStatus, ItemType } from '@prisma/client';

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