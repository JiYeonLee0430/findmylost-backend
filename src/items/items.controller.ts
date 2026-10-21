import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ItemStatus, ItemType } from '@prisma/client';
import { IsEnum, IsLatitude, IsLongitude, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { OptionalJwtAuthGuard } from '../common/optional-jwt.guard';
import { RolesGuard } from '../common/roles.guard';
import { ItemsService } from './items.service';
import { ListItemsQueryDto } from './items-query.dto';

class CreateItemDto {
  @IsString() title: string;
  @IsEnum(ItemType) type: ItemType;
  @IsString() category: string;
  @IsLatitude() locationLat: number;
  @IsLongitude() locationLng: number;
  @IsOptional() @IsString() storageLocation?: string;
}
class UploadUrlDto {
  @IsString() filename: string;
  @IsString() contentType: string;
}
class RegisterImageDto {
  @IsString() key: string;
}
class StatusDto {
  @IsEnum(ItemStatus) status: ItemStatus;
}

class UpdateItemDto {
  @ApiPropertyOptional({ example: '검정 지갑' })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ example: '지갑' })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(50)
  category?: string;

  @ApiPropertyOptional({ example: 36.8 })
  @IsOptional() @IsLatitude()
  locationLat?: number;

  @ApiPropertyOptional({ example: 127.1 })
  @IsOptional() @IsLongitude()
  locationLng?: number;

  @ApiPropertyOptional({ example: '학생회관 1층', nullable: true, description: 'null이면 삭제' })
  @IsOptional() @IsString() @MaxLength(200)
  storageLocation?: string | null;
}

@ApiTags('Items (게시글)')
@ApiBearerAuth()
@Controller('items')
export class ItemsController {
  constructor(private items: ItemsService) {}

  // ── 조회: 로그인 없이 가능 (토큰이 있으면 로그인 사용자로 처리) ──
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  list(@CurrentUser() user: AuthUser | null, @Query() query: ListItemsQueryDto) {
    return this.items.list(user, query);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  detail(@CurrentUser() user: AuthUser | null, @Param('id', ParseIntPipe) id: number) {
    return this.items.detail(user, id);
  }

  // ── 쓰기: 로그인 필요 ──
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateItemDto) {
    return this.items.create(user, dto);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateItemDto) {
    return this.items.update(user, id, dto);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Post(':id/images/upload-url')
  uploadUrl(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UploadUrlDto) {
    return this.items.createUploadUrl(user, id, dto.filename, dto.contentType);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Post(':id/images')
  registerImage(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RegisterImageDto) {
    return this.items.registerImage(user, id, dto.key);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Patch(':id/status')
  status(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: StatusDto) {
    return this.items.updateStatus(user, id, dto.status);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.items.remove(user, id);
  }
}