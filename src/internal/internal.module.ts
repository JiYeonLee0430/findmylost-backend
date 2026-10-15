import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { InternalApiKeyGuard } from '../common/internal-api-key.guard';

@Module({ controllers: [InternalController], providers: [InternalApiKeyGuard] })
export class InternalModule {}