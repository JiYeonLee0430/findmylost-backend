import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { InstitutionsModule } from './institutions/institutions.module';
import { ItemsModule } from './items/items.module';
import { InternalModule } from './internal/internal.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    InstitutionsModule,
    ItemsModule,
    InternalModule,
  ],
  controllers: [AppController], // 기존 AppController 유지
  providers: [AppService],      // 기존 AppService 유지
})
export class AppModule {}