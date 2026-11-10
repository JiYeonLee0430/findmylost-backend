import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ChatService } from './chat.service';
import { MessagesQueryDto, SendMessageDto } from './chat.dto';
import { ChatGateway } from './chat.gateway';

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller()
export class ChatController {
  constructor(private chat: ChatService, private gateway: ChatGateway) {}

  @Post('items/:id/conversations')
  @ApiOperation({ summary: '작성자에게 문의하기 (대화방 생성 또는 기존 방 반환)', description: '이메일 인증한 사용자만, 진행 중인 남의 글에만 새로 만들 수 있습니다.' })
  start(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) itemId: number) {
    return this.chat.startConversation(user, itemId);
  }

  @Get('conversations')
  @ApiOperation({ summary: '내 대화 목록 (최근 대화 순, 최대 50개)' })
  list(@CurrentUser() user: AuthUser) {
    return this.chat.listConversations(user);
  }

  @Get('conversations/unread-count')
  @ApiOperation({ summary: '안 읽은 메시지 총개수 (배지용)' })
  unread(@CurrentUser() user: AuthUser) {
    return this.chat.unreadCount(user);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: '메시지 불러오기 (최신 50개 / after: 새 메시지만 / before: 예전 메시지). 최신을 불러오면 읽음 처리' })
  messages(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Query() q: MessagesQueryDto) {
    return this.chat.getMessages(user, id, q);
  }

  @Post('conversations/:id/messages')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: '메시지 보내기 (1~1000자, 분당 20개). 저장 후 두 참여자에게 실시간 message:new 전송' })
  async send(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: SendMessageDto) {
    const { message, participantIds } = await this.chat.sendMessage(user, id, dto.content);
    this.gateway.emitNewMessage(participantIds, message);
    return { ...message, isMine: true };
  }

  @Post('conversations/:id/read')
  @HttpCode(200)
  @ApiOperation({ summary: '읽음 처리 (대화방을 보는 중 실시간으로 메시지를 받았을 때)' })
  read(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.chat.markRead(user, id);
  }
}