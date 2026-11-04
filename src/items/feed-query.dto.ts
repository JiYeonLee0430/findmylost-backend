import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class FeedQueryDto {
  @ApiPropertyOptional({ example: '지갑/카드', description: '분류 (전체면 보내지 않음)' })
  @IsOptional() @IsString() @MaxLength(50) category?: string;

  @ApiPropertyOptional({ description: '제목/물품명 검색' })
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;

  @ApiPropertyOptional({ enum: ['all', 'internal', 'public'], description: '기본 all (우리 글 + 공공)' })
  @IsOptional() @IsIn(['all', 'internal', 'public']) source?: 'all' | 'internal' | 'public';

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @ApiPropertyOptional({ example: 20, description: '최대 50' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}