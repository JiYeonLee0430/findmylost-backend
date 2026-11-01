import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class PublicItemDto {
  @IsString() @MaxLength(50) atcId: string;
  @IsString() @MaxLength(20) fdSn: string;
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(20) foundDate?: string; // YYYY-MM-DD 또는 YYYYMMDD
  @IsOptional() @IsString() @MaxLength(300) storagePlace?: string;
  @IsOptional() @IsString() @MaxLength(1000) @Matches(/^https?:\/\//) imageUrl?: string;
  @IsOptional() @IsString() @MaxLength(200) institutionName?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsString() @MaxLength(2000) content?: string;
  @IsOptional() @IsString() @MaxLength(50) region?: string;
  @IsOptional() @IsObject() raw?: Record<string, unknown>;
}

export class BulkPublicItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PublicItemDto)
  items: PublicItemDto[];
}