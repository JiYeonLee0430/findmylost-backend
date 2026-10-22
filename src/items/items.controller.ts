import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ItemStatus, ItemType } from '@prisma/client';
import { IsEnum, IsLatitude, IsLongitude, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { OptionalJwtAuthGuard } from '../common/optional-jwt.guard';
import { RolesGuard } from '../common/roles.guard';
import { ItemsService } from './items.service';
import { ListItemsQueryDto } from './items-query.dto';
import { MapItemsQueryDto } from './items-map-query.dto';
import { SimilarItemsQueryDto } from './items-similar-query.dto';

class CreateItemDto {
  @ApiProperty({ example: '검정 지갑', description: '게시글 제목' })
  @IsString() title: string;

  @ApiProperty({ enum: ItemType, description: 'LOST: 분실물 / FOUND: 습득물' })
  @IsEnum(ItemType) type: ItemType;

  @ApiProperty({ example: '지갑', description: '카테고리' })
  @IsString() category: string;

  @ApiProperty({ example: 36.8, description: '위도' })
  @IsLatitude() locationLat: number;

  @ApiProperty({ example: 127.1, description: '경도' })
  @IsLongitude() locationLng: number;

  @ApiPropertyOptional({ example: '학생회관 1층 분실물센터', description: '보관 장소 (기관 계정의 습득물만 입력 가능)' })
  @IsOptional() @IsString() storageLocation?: string;
}

class UploadUrlDto {
  @ApiProperty({ example: 'wallet.jpg', description: '원본 파일명' })
  @IsString() filename: string;

  @ApiProperty({ example: 'image/jpeg', description: '파일 MIME 타입 (image/* 만 가능)' })
  @IsString() contentType: string;
}

class RegisterImageDto {
  @ApiProperty({ example: 'items/12/abc-wallet.jpg', description: 'upload-url 응답으로 받은 S3 key' })
  @IsString() key: string;
}

class StatusDto {
  @ApiProperty({ enum: ItemStatus, description: 'OPEN: 진행 중 / RETURNED: 반환 완료' })
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

  @ApiPropertyOptional({ type: String, nullable: true, example: '학생회관 1층', description: 'null을 보내면 삭제' })
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
  @ApiOperation({
    summary: '게시글 목록 조회',
    description:
      '로그인 없이 조회할 수 있습니다. 기본값은 미해결(OPEN) 게시글을 최신순으로 반환하며, 응답은 { items, total, page, limit }입니다. 보관 장소(storageLocation)는 로그인한 사용자에게만 내려가고 비로그인은 null입니다. 사진은 1시간 유효한 임시 URL(thumbnailUrl)입니다.',
  })
  list(@CurrentUser() user: AuthUser | null, @Query() query: ListItemsQueryDto) {
    return this.items.list(user, query);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('map')
  @ApiOperation({
    summary: '지도용 게시글 조회',
    description:
      '지도 화면 영역(minLat, maxLat, minLng, maxLng) 또는 내 주변(lat, lng, radiusKm)으로 조회합니다. 둘 다 보내면 영역이 우선입니다. 마커용이라 사진은 내려가지 않으며 한 번에 최대 200개입니다. 반경 조회는 가까운 순으로 정렬되고 distanceKm가 포함됩니다.',
  })
  @ApiResponse({ status: 400, description: '영역 또는 중심 좌표가 없거나 범위가 잘못됨' })
  map(@CurrentUser() user: AuthUser | null, @Query() query: MapItemsQueryDto) {
    return this.items.mapItems(user, query);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  @ApiOperation({
    summary: '게시글 상세 조회',
    description:
      '로그인 없이 조회할 수 있습니다. 사진은 imageUrls(1시간 유효한 임시 URL)로 내려가고, 로그인한 작성자에게는 isMine이 true입니다. 보관 장소는 로그인 사용자에게만 보입니다.',
  })
  @ApiResponse({ status: 404, description: '게시글을 찾을 수 없음' })
  detail(@CurrentUser() user: AuthUser | null, @Param('id', ParseIntPipe) id: number) {
    return this.items.detail(user, id);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/similar')
  @ApiOperation({
    summary: '비슷한 게시글 찾기 (사진 유사도)',
    description:
      '이 게시글의 사진과 비슷한 게시글을 유사도 순으로 반환합니다. 기본은 반대 유형만(분실물이면 습득물) 진행 중인 게시글에서 찾습니다. similarity는 0~1이며 1에 가까울수록 비슷합니다. 사진 분석이 아직 끝나지 않은 게시글은 ready: false를 반환합니다. 로그인 없이 조회할 수 있고 보관 장소는 로그인 사용자에게만 내려갑니다.',
  })
  @ApiResponse({ status: 404, description: '게시글을 찾을 수 없음' })
  similar(
    @CurrentUser() user: AuthUser | null,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: SimilarItemsQueryDto,
  ) {
    return this.items.similar(user, id, query);
  }

  // ── 쓰기: 로그인 필요 ──
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Post()
  @ApiOperation({
    summary: '게시글 등록',
    description:
      '로그인이 필요합니다. 기관 관리자(ORG_ADMIN)가 등록하면 자동으로 소속 기관이 연결됩니다. 보관 장소는 기관 계정의 습득물(FOUND)에만 입력할 수 있습니다. 사진은 등록 후 upload-url, S3 업로드, 이미지 등록 순서로 추가합니다.',
  })
  @ApiResponse({ status: 401, description: '로그인 필요' })
  @ApiResponse({ status: 403, description: '보관 장소를 입력할 수 없는 계정' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateItemDto) {
    return this.items.create(user, dto);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Post(':id/images/upload-url')
  @ApiOperation({
    summary: '사진 업로드 URL 발급',
    description:
      '작성자 또는 같은 기관 관리자만 가능합니다. 응답의 uploadUrl(5분 유효)로 사진 파일을 S3에 PUT 요청으로 직접 올리고, 응답의 key는 다음 단계(이미지 등록)에서 사용합니다. PUT 요청의 Content-Type은 여기서 보낸 contentType과 같아야 합니다.',
  })
  @ApiResponse({ status: 400, description: '이미지 파일이 아님' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  uploadUrl(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UploadUrlDto) {
    return this.items.createUploadUrl(user, id, dto.filename, dto.contentType);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Post(':id/images')
  @ApiOperation({
    summary: '업로드한 사진 등록',
    description: 'S3 업로드가 끝난 뒤 upload-url 응답의 key를 보내 게시글에 사진을 연결합니다. key는 items/{게시글ID}/ 로 시작해야 합니다.',
  })
  @ApiResponse({ status: 400, description: '잘못된 S3 key' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  registerImage(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RegisterImageDto) {
    return this.items.registerImage(user, id, dto.key);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Patch(':id')
  @ApiOperation({
    summary: '게시글 내용 수정',
    description:
      '작성자 또는 같은 기관 관리자만 가능합니다. 바꿀 항목만 보내면 되고(title, category, locationLat, locationLng, storageLocation), 게시글 유형(type)은 수정할 수 없습니다. storageLocation에 null을 보내면 삭제됩니다.',
  })
  @ApiResponse({ status: 400, description: '수정할 항목이 없거나 값이 올바르지 않음' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateItemDto) {
    return this.items.update(user, id, dto);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Patch(':id/status')
  @ApiOperation({
    summary: '게시글 상태 변경',
    description: '작성자 또는 같은 기관 관리자만 가능합니다. OPEN(진행 중)과 RETURNED(반환 완료)로 바꿉니다.',
  })
  @ApiResponse({ status: 403, description: '권한 없음' })
  status(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: StatusDto) {
    return this.items.updateStatus(user, id, dto.status);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Delete(':id')
  @ApiOperation({
    summary: '게시글 삭제',
    description: '작성자 또는 같은 기관 관리자만 가능합니다. 게시글과 함께 등록된 사진 정보와 S3의 사진 파일도 삭제됩니다.',
  })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @ApiResponse({ status: 404, description: '게시글을 찾을 수 없음' })
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.items.remove(user, id);
  }
}