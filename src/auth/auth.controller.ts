import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, SignupDto } from './auth.dto';

@ApiTags('Auth (인증)')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

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
}