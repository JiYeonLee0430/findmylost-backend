import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListPublicItemsQueryDto {
  @ApiPropertyOptional({ example: '지갑/카드', description: '분류 (전자기기, 지갑/카드, 귀중품, 가방, 의류, 우산, 기타)' })
  @IsOptional() @IsString() @MaxLength(50) category?: string;

  @ApiPropertyOptional({ example: '서울', description: '지역명 (시/도)' })
  @IsOptional() @IsString() @MaxLength(50) region?: string;

  @ApiPropertyOptional({ example: '지갑', description: '물품명 검색' })
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;

  @ApiPropertyOptional({ example: '2026-10-30', description: '습득일 시작 (기본: 30일 전)' })
  @IsOptional() @IsDateString() from?: string;

  @ApiPropertyOptional({ example: '2026-11-02', description: '습득일 끝' })
  @IsOptional() @IsDateString() to?: string;

  @ApiPropertyOptional({ description: 'true면 사진 있는 항목을 먼저 (추천용)' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  photoFirst?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @ApiPropertyOptional({ example: 20, description: '최대 50' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}