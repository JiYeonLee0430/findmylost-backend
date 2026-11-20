import { Module } from '@nestjs/common';
import { S3Service } from '../items/s3.service';
import { MyNotesController, NotesController, PublicNotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  controllers: [NotesController, PublicNotesController, MyNotesController],
  providers: [NotesService, S3Service],
})
export class NotesModule {}