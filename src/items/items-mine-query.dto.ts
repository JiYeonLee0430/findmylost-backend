import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ItemStatus, ItemType } from '@prisma/client';

export class ManageItemsQueryDto {
  @ApiPropertyOptional({ enum: ItemType })
  @IsOptional() @IsEnum(ItemType)
  type?: ItemType;

  @ApiPropertyOptional({ enum: ItemStatus, description: '지정하지 않으면 전체 상태' })
  @IsOptional() @IsEnum(ItemStatus)
  status?: ItemStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit?: number;
}