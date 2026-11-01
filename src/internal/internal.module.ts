import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { InternalApiKeyGuard } from '../common/internal-api-key.guard';
import { PublicItemsInternalController } from './public-items.controller';

@Module({
  controllers: [InternalController, PublicItemsInternalController],
  providers: [InternalApiKeyGuard],
})
export class InternalModule {}