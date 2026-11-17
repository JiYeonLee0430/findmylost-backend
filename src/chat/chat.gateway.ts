import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Role } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

export interface ChatMessagePayload {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  createdAt: Date;
}

@WebSocketGateway({
  path: '/api/socket.io', // CloudFront의 기존 /api/* 경로로 들어오게
  cors: { origin: ['http://localhost:5173', 'http://localhost:3000'], credentials: true }, // 로컬 개발용 (운영은 같은 주소라 불필요)
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(private jwt: JwtService, private prisma: PrismaService) {}

  /** 연결 시 로그인 확인: jwt.strategy + RolesGuard와 같은 기준 */
  async handleConnection(client: Socket) {
    try {
      const raw = client.handshake.auth?.token;
      const token = typeof raw === 'string' ? raw.replace(/^Bearer\s+/i, '') : '';
      if (!token) throw new Error('no token');

      const payload = await this.jwt.verifyAsync<{ sub: number; scope?: string; mfa?: boolean; exp: number }>(token);
      if (payload.scope === 'mfa-pending') throw new Error('mfa pending');

      const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, role: true } });
      if (!user) throw new Error('no user');
      if (user.role !== Role.USER && payload.mfa !== true) throw new Error('mfa required');

      client.data.userId = user.id;
      await client.join(`user:${user.id}`);

      // 토큰이 만료되면 연결 종료 (프론트는 새 토큰으로 다시 연결)
      const ms = payload.exp * 1000 - Date.now();
      client.data.expTimer = setTimeout(() => {
        client.emit('auth_error', { message: '로그인이 만료되었습니다.' });
        client.disconnect(true);
      }, Math.max(ms, 0));

      client.emit('ready', { userId: user.id });
    } catch {
      client.emit('auth_error', { message: '로그인이 필요합니다.' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data?.expTimer) clearTimeout(client.data.expTimer);
  }

    /** 지정한 사용자들에게 실시간 이벤트 전송 (각자의 다른 탭에도 감) */
  emitToUsers(userIds: number[], event: string, payload: unknown) {
    for (const uid of new Set(userIds)) {
      this.server.to(`user:${uid}`).emit(event, payload);
    }
  }

  /** 새 메시지를 두 참여자에게 실시간 전송 */
  emitNewMessage(participantIds: number[], message: ChatMessagePayload) {
    this.emitToUsers(participantIds, 'message:new', message);
  }
}