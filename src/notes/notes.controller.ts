import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/current-user.decorator';
import { RolesGuard } from '../common/roles.guard';
import { NotesService } from './notes.service';
import { CreateNoteDto } from './notes.dto';

@ApiTags('notes')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('items/:id/notes')
export class NotesController {
  constructor(private notes: NotesService) {}

  @Get()
  @ApiOperation({ summary: '메모 조회: 내 개인 메모 + (이 글의 기관 관리자면) 기관 메모, 최신순' })
  list(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.notes.list(user, id);
  }

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: '메모 작성 (1~1000자). INSTITUTION은 그 글을 등록한 기관의 관리자만' })
  create(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: CreateNoteDto) {
    return this.notes.create(user, id, dto);
  }

  @Delete(':noteId')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: '메모 삭제 (내가 쓴 메모만)' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('noteId', ParseIntPipe) noteId: number,
  ) {
    return this.notes.remove(user, id, noteId);
  }
}