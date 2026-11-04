import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicItemsService } from './public-items.service';
import { ListPublicItemsQueryDto } from './public-items-query.dto';

@ApiTags('public-items')
@Controller('public-items')
export class PublicItemsController {
  constructor(private service: PublicItemsService) {}

  @Get()
  @ApiOperation({ summary: '공공 습득물 목록/추천 (분류, 지역, 기간 필터. photoFirst=true면 사진 있는 것 먼저)' })
  list(@Query() q: ListPublicItemsQueryDto) {
    return this.service.list(q);
  }

  @Get(':id')
  @ApiOperation({ summary: '공공 습득물 상세' })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }
}