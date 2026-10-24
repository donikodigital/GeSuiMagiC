//backend/src/site-logs/site-logs.module.ts
import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuditModule } from '../audit/audit.module';
import { SiteLogsController } from './site-logs.controller';
import { SiteLogsService } from './site-logs.service';

@Module({
  imports: [AuditModule, AttachmentsModule],
  controllers: [SiteLogsController],
  providers: [SiteLogsService],
  exports: [SiteLogsService],
})
export class SiteLogsModule {}
