import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MaxBytes } from '../common/max-bytes.decorator';

// 이메일은 앞뒤 공백을 지우고 소문자로 통일 (User@Test.com과 user@test.com을 같은 계정으로)
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class SignupDto {
  @ApiProperty({ example: 'user@test.com', description: '소문자로 변환되어 저장됩니다' })
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'password123',
    minLength: 8,
    description: '8자 이상, 영문과 숫자를 모두 포함, 72바이트 이하 (한글은 글자당 3바이트)',
  })
  @IsString()
  @MinLength(8)
  @MaxBytes(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: '비밀번호는 영문과 숫자를 모두 포함해야 합니다.' })
  password: string;

  @ApiProperty({ example: '홍길동' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user@test.com', description: '대소문자 구분 없이 로그인됩니다' })
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MaxLength(200)
  password: string;
}

export class SendVerificationDto {
  @ApiProperty({ example: 'user@test.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: '메일 링크의 token 값' })
  @IsString()
  @MinLength(32)
  token: string;
}