import { Module } from '@nestjs/common';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';
import { S3Service } from './s3.service';
import { BedrockService } from './bedrock.service';

@Module({ controllers: [ItemsController], providers: [ItemsService, S3Service, BedrockService] })
export class ItemsModule {}