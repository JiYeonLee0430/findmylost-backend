import { Body, Controller, Delete, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ItemStatus, ItemType } from '@prisma/client';
import { IsEnum, IsLatitude, IsLongitude, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ItemsService } from './items.service';

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

@ApiTags('Items (게시글)')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('items')
export class ItemsController {
  constructor(private items: ItemsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateItemDto) {
    return this.items.create(user, dto);
  }

  @Post(':id/images/upload-url')
  uploadUrl(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UploadUrlDto) {
    return this.items.createUploadUrl(user, id, dto.filename, dto.contentType);
  }

  @Post(':id/images')
  registerImage(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RegisterImageDto) {
    return this.items.registerImage(user, id, dto.key);
  }

  @Patch(':id/status')
  status(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: StatusDto) {
    return this.items.updateStatus(user, id, dto.status);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.items.remove(user, id);
  }
}