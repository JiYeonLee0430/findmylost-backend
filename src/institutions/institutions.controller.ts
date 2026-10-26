import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { InstitutionsService } from './institutions.service';

class RequestVerificationDto {
  @ApiProperty({ example: 1, description: '인증을 신청할 기관 ID' })
  @IsInt() institutionId: number;

  @ApiPropertyOptional({ example: '재직증명서 확인 가능, 학생처 담당', description: '재직 증빙 설명' })
  @IsOptional() @IsString() evidence?: string;
}

@ApiTags('Institutions (기관 인증)')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller()
export class InstitutionsController {
  constructor(private service: InstitutionsService) {}

  @Get('institutions')
  @ApiOperation({
    summary: '기관 목록',
    description: '기관 인증 신청 시 선택할 기관 목록입니다. 로그인이 필요합니다.',
  })
  listInstitutions() {
    return this.service.listInstitutions();
  }

  @Roles(Role.USER)
  @Post('institutions/verification-requests')
  @ApiOperation({
    summary: '기관 인증 신청',
    description:
      '일반 계정(USER)이 기관 관리자 권한을 신청합니다. 이메일 인증과 MFA 등록을 먼저 완료해야 하며, 심사 중인 신청이 있으면 다시 신청할 수 없습니다. 운영자(SUPER_ADMIN)가 승인하면 기관 관리자(ORG_ADMIN)로 바뀝니다.',
  })
  @ApiResponse({ status: 403, description: '이메일 인증 또는 MFA 미완료, 또는 일반 계정이 아님' })
  @ApiResponse({ status: 404, description: '기관을 찾을 수 없음' })
  @ApiResponse({ status: 409, description: '이미 심사 중인 신청이 있거나 이미 기관 권한이 있음' })
  request(@CurrentUser() user: AuthUser, @Body() dto: RequestVerificationDto) {
    return this.service.requestVerification(user, dto.institutionId, dto.evidence);
  }

  @Roles(Role.SUPER_ADMIN)
  @Get('admin/verification-requests')
  @ApiOperation({
    summary: '[운영자] 심사 대기 중인 기관 인증 신청 목록',
    description: '운영자(SUPER_ADMIN) 전용이며 MFA 로그인이 필요합니다. 오래된 신청부터 반환합니다.domainMatched는 신청자의 인증된 이메일 도메인이 기관 도메인과 같은지(서브도메인 포함)를 나타내며 참고용입니다. 자동 승인의 근거가 아닙니다.',
  })
  @ApiResponse({ status: 403, description: '운영자가 아니거나 MFA 인증이 필요함' })
  list() {
    return this.service.listPending();
  }

  @Roles(Role.SUPER_ADMIN)
  @Patch('admin/verification-requests/:id/approve')
  @ApiOperation({
    summary: '[운영자] 기관 인증 신청 승인',
    description: '승인하면 신청자의 역할이 ORG_ADMIN으로 바뀌고 해당 기관에 소속됩니다.',
  })
  @ApiResponse({ status: 400, description: '이미 처리되었거나 존재하지 않는 신청' })
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.approve(id, user.id);
  }

  @Roles(Role.SUPER_ADMIN)
  @Patch('admin/verification-requests/:id/reject')
  @ApiOperation({
    summary: '[운영자] 기관 인증 신청 거절',
    description: '신청을 거절 처리합니다. 신청자의 역할은 바뀌지 않습니다.',
  })
  @ApiResponse({ status: 400, description: '이미 처리되었거나 존재하지 않는 신청' })
  reject(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.reject(id, user.id);
  }
}