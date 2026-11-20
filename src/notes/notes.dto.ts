import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NoteScope } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateNoteDto {
  @ApiProperty({ example: '11/17 주인 연락 옴, 신분증 확인 후 반환 예정', maxLength: 1000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content: string;

  @ApiProperty({ enum: NoteScope, description: 'PRIVATE: 나만 보기 / INSTITUTION: 그 글을 등록한 기관의 관리자만' })
  @IsEnum(NoteScope)
  scope: NoteScope;
}

/** 경찰청 습득물 메모: 개인 메모만 */
export class CreatePublicNoteDto {
  @ApiProperty({ example: '내 지갑 같음, 경찰서에 전화해보기', maxLength: 1000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content: string;

  @ApiPropertyOptional({ enum: [NoteScope.PRIVATE], description: '경찰청 습득물은 개인 메모만 (안 보내도 됨)' })
  @IsOptional()
  @IsIn([NoteScope.PRIVATE], { message: '경찰청 습득물에는 개인 메모(PRIVATE)만 쓸 수 있습니다.' })
  scope?: NoteScope;
}

/** 내 메모 모아보기 */
export class MyNotesQueryDto {
  @ApiPropertyOptional({ enum: ['all', 'internal', 'public'], description: '기본 all (우리 글 + 경찰청)' })
  @IsOptional() @IsIn(['all', 'internal', 'public'])
  source?: 'all' | 'internal' | 'public';

  @ApiPropertyOptional({ enum: NoteScope, description: '없으면 전체' })
  @IsOptional() @IsEnum(NoteScope)
  scope?: NoteScope;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit?: number;
}