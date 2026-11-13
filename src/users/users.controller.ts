import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { RolesGuard } from '../common/roles.guard';
import { UsersService } from './users.service';
import { ChangePasswordDto, UpdateProfileDto, WithdrawDto } from './users.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: '내 정보 (이메일, 이름, 역할, 인증 상태, 소속 기관, 내가 쓴 글 개수)' })
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: '이름 변경 (1~30자)' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto.name);
  }

  @Patch('me/password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: '비밀번호 변경 (분당 5회). 현재 비밀번호가 틀리면 400' })
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.users.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @Post('me/withdraw')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: '회원 탈퇴 (일반 회원만, 비밀번호 확인)',
    description: '내 글(사진, AI 벡터, 대화 포함), 참여한 대화, 인증 기록, 계정을 삭제합니다. 되돌릴 수 없습니다.',
  })
  withdraw(@CurrentUser() user: AuthUser, @Body() dto: WithdrawDto) {
    return this.users.withdraw(user.id, dto.password);
  }
}