//backend/src/attachments/attachments.module.ts
import { Module } from '@nestjs/common';
import { AttachmentsController, AttachmentsService } from './attachments.controller';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [AuditModule, StorageModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
