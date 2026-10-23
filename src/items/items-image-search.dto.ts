import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

/** multer가 넘겨주는 업로드 파일 중 우리가 쓰는 부분 */
export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export class SearchByImageDto {
  @ApiPropertyOptional({
    enum: ['FOUND', 'LOST', 'ALL'],
    default: 'FOUND',
    description: '검색 대상: FOUND(습득물) / LOST(분실물) / ALL(전체)',
  })
  @IsOptional() @IsIn(['FOUND', 'LOST', 'ALL'])
  target?: 'FOUND' | 'LOST' | 'ALL';

  @ApiPropertyOptional({ default: 10, maximum: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20)
  limit?: number;

  @ApiPropertyOptional({ example: 0.5, description: '이 값 이상으로 비슷한 것만 (0~1). 기준값은 실제 데이터로 정해야 합니다' })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1)
  minSimilarity?: number;
}