import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { LoginDto, SendVerificationDto, SignupDto, VerifyEmailDto } from './auth.dto';

@ApiTags('Auth (인증)')
@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private emailVerification: EmailVerificationService,
  ) {}

  @Post('signup')
  @ApiOperation({ summary: '일반 회원가입', description: '모든 가입은 일반 계정(USER)으로 생성됩니다.' })
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Post('login')
  @ApiOperation({
    summary: '로그인',
    description: 'MFA 미등록: accessToken 반환 / MFA 등록: mfaRequired와 mfaToken 반환 후 /auth/mfa/login 호출',
  })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('email/send')
  @ApiOperation({
    summary: '인증 메일 (재)발송',
    description: '60초 이내 재요청은 무시되고, 계정 존재 여부와 관계없이 항상 ok를 반환합니다.',
  })
  sendVerification(@Body() dto: SendVerificationDto) {
    return this.emailVerification.resendByEmail(dto.email);
  }

  @Post('email/verify')
  @ApiOperation({
    summary: '이메일 인증 토큰 검증',
    description: '메일 링크의 token을 보내면 인증이 완료됩니다. (24시간 유효, 1회용)',
  })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.emailVerification.verify(dto.token);
  }
}