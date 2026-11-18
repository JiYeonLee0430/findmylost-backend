import { ApiProperty } from '@nestjs/swagger';
import { NoteScope } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

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