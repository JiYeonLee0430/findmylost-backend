import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { MfaService } from './mfa.service';

class CodeDto {
  @IsString() @Length(6, 6) code: string;
}
class MfaLoginDto extends CodeDto {
  @IsString() mfaToken: string;
}

@ApiTags('MFA')
@Controller('auth/mfa')
export class MfaController {
  constructor(private mfa: MfaService) {}

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('setup')
  setup(@CurrentUser() user: AuthUser) {
    return this.mfa.setup(user.id);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('enable')
  enable(@CurrentUser() user: AuthUser, @Body() dto: CodeDto) {
    return this.mfa.enable(user.id, dto.code);
  }

  @Post('login')
  login(@Body() dto: MfaLoginDto) {
    return this.mfa.verifyLogin(dto.mfaToken, dto.code);
  }
}