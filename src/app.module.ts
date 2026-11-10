import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { InstitutionsModule } from './institutions/institutions.module';
import { ItemsModule } from './items/items.module';
import { InternalModule } from './internal/internal.module';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PublicItemsModule } from './public-items/public-items.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }], // 기본: IP당 1분에 120회
      skipIf: () => process.env.THROTTLE_DISABLED === 'true',     // 문제가 생기면 서버 환경변수로 즉시 끌 수 있는 스위치
    }),
    PrismaModule,
    AuthModule,
    InstitutionsModule,
    ItemsModule,
    InternalModule,
    PublicItemsModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard }, // 모든 API에 제한 적용
  ],
})
export class AppModule {}