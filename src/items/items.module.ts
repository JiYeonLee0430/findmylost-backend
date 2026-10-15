import { Module } from '@nestjs/common';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';
import { S3Service } from './s3.service';

@Module({ controllers: [ItemsController], providers: [ItemsService, S3Service] })
export class ItemsModule {}