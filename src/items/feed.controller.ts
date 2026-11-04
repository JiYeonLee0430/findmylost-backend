import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { OptionalJwtAuthGuard } from '../common/optional-jwt.guard';
import { FeedQueryDto } from './feed-query.dto';
import { FeedService } from './feed.service';

@ApiTags('feed')
@Controller('feed')
export class FeedController {
  constructor(private feedService: FeedService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '습득물 피드: 우리 습득물 + 공공 습득물을 날짜순으로 합쳐서 (source로 구분)' })
  list(@CurrentUser() user: AuthUser | null, @Query() q: FeedQueryDto) {
    return this.feedService.feed(user, q);
  }
}