import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { InstitutionsService } from './institutions.service';

class RequestVerificationDto {
  @IsInt() institutionId: number;
  @IsOptional() @IsString() evidence?: string;
}

@ApiTags('Institutions (기관 인증)')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller()
export class InstitutionsController {
  constructor(private service: InstitutionsService) {}

  @Roles(Role.USER)
  @Post('institutions/verification-requests')
  request(@CurrentUser() user: AuthUser, @Body() dto: RequestVerificationDto) {
    return this.service.requestVerification(user, dto.institutionId, dto.evidence);
  }

  @Roles(Role.SUPER_ADMIN)
  @Get('admin/verification-requests')
  list() {
    return this.service.listPending();
  }

  @Roles(Role.SUPER_ADMIN)
  @Patch('admin/verification-requests/:id/approve')
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.approve(id, user.id);
  }

  @Roles(Role.SUPER_ADMIN)
  @Patch('admin/verification-requests/:id/reject')
  reject(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.reject(id, user.id);
  }
}