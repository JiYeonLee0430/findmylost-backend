import { Module } from '@nestjs/common';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';
import { S3Service } from './s3.service';
import { BedrockService } from './bedrock.service';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({ controllers: [ItemsController, FeedController], providers: [ItemsService, S3Service, BedrockService, FeedService] })
export class ItemsModule {}