import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: '안녕하세요, 혹시 지갑 안에 학생증이 있었나요?', maxLength: 1000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content: string;
}

export class MessagesQueryDto {
  @ApiPropertyOptional({ description: '이 메시지 id 이후의 새 메시지만 (재연결 시 빠진 메시지 받기)' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  after?: number;

  @ApiPropertyOptional({ description: '이 메시지 id 이전의 예전 메시지 (위로 스크롤)' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  before?: number;
}