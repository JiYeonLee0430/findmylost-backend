import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MaxBytes } from '../common/max-bytes.decorator';

export class UpdateProfileDto {
  @ApiProperty({ example: '이지연', maxLength: 30 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  name: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: '현재 비밀번호' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  currentPassword: string;

  // ↓ 회원가입 DTO(auth.dto.ts)의 password 데코레이터와 똑같이 맞추세요
  @ApiProperty({ description: '새 비밀번호 (8자 이상, 영문과 숫자 포함)' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: '비밀번호는 영문과 숫자를 모두 포함해야 합니다.' })
  @MaxBytes(72)
  newPassword: string;
}

export class WithdrawDto {
  @ApiProperty({ description: '본인 확인용 현재 비밀번호' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;
}