import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ItemStatus, ItemType } from '@prisma/client';

export class MapItemsQueryDto {
  // ── 방식 1: 지도 화면 영역 ──
  @ApiPropertyOptional({ example: 36.7, description: '영역 남쪽 위도' })
  @IsOptional() @Type(() => Number) @IsLatitude()
  minLat?: number;

  @ApiPropertyOptional({ example: 36.9, description: '영역 북쪽 위도' })
  @IsOptional() @Type(() => Number) @IsLatitude()
  maxLat?: number;

  @ApiPropertyOptional({ example: 127.0, description: '영역 서쪽 경도' })
  @IsOptional() @Type(() => Number) @IsLongitude()
  minLng?: number;

  @ApiPropertyOptional({ example: 127.2, description: '영역 동쪽 경도' })
  @IsOptional() @Type(() => Number) @IsLongitude()
  maxLng?: number;

  // ── 방식 2: 내 주변 반경 ──
  @ApiPropertyOptional({ example: 36.8, description: '중심 위도' })
  @IsOptional() @Type(() => Number) @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: 127.1, description: '중심 경도' })
  @IsOptional() @Type(() => Number) @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ example: 3, description: '반경(km), 최대 50', default: 3 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.1) @Max(50)
  radiusKm?: number;

  // ── 공통 필터 ──
  @ApiPropertyOptional({ enum: ItemType })
  @IsOptional() @IsEnum(ItemType)
  type?: ItemType;

  @ApiPropertyOptional({ enum: ItemStatus, description: '기본값 OPEN' })
  @IsOptional() @IsEnum(ItemStatus)
  status?: ItemStatus;

  @ApiPropertyOptional({ example: '지갑' })
  @IsOptional() @IsString() @MaxLength(50)
  category?: string;
}