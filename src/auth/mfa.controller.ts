import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { MfaService } from './mfa.service';
import { Throttle } from '@nestjs/throttler';

class CodeDto {
  @ApiProperty({ example: '123456', description: '인증 앱에 표시된 6자리 코드' })
  @IsString() @Length(6, 6) code: string;
}

class MfaLoginDto extends CodeDto {
  @ApiProperty({ description: '로그인 응답으로 받은 mfaToken (5분 유효)' })
  @IsString() mfaToken: string;
}

@ApiTags('MFA (2단계 인증)')
@Controller('auth/mfa')
export class MfaController {
  constructor(private mfa: MfaService) {}

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { limit: 5, ttl: 60_000 } })    // 1분 5회
  @Post('setup')
  @ApiOperation({
    summary: 'MFA 등록 시작',
    description: '인증 앱(Google Authenticator 등)에 등록할 QR 코드(qrDataUrl)와 otpauthUrl을 반환합니다. 아직 활성화되지 않은 상태이며 enable로 코드를 확인해야 켜집니다.',
  })
  @ApiResponse({ status: 400, description: '이미 MFA가 등록되어 있음' })
  setup(@CurrentUser() user: AuthUser) {
    return this.mfa.setup(user.id);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))  @Throttle({ default: { limit: 5, ttl: 60_000 } })    // 1분 5회
  @Post('enable')
  @ApiOperation({
    summary: 'MFA 활성화',
    description: '인증 앱에 표시된 6자리 코드를 보내 MFA를 켭니다. 성공하면 MFA 인증이 완료된 새 accessToken을 반환합니다.',
  })
  @ApiResponse({ status: 400, description: '인증 코드가 올바르지 않음' })
  enable(@CurrentUser() user: AuthUser, @Body() dto: CodeDto) {
    return this.mfa.enable(user.id, dto.code);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })    // 모두 1분 5회
  @Post('login')
  @ApiOperation({
    summary: 'MFA 로그인 (2단계)',
    description: '로그인 응답이 mfaRequired: true일 때 받은 mfaToken과 인증 앱의 6자리 코드를 보내 accessToken을 받습니다.',
  })
  @ApiResponse({ status: 401, description: '토큰이 만료되었거나 코드가 올바르지 않음' })
  login(@Body() dto: MfaLoginDto) {
    return this.mfa.verifyLogin(dto.mfaToken, dto.code);
  }
}