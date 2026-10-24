//backend/src/quality/quality.module.ts
import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuditModule } from '../audit/audit.module';
import { QualityController } from './quality.controller';
import { ReceptionsService } from './receptions.service';
import { SnagsService } from './snags.service';

@Module({
  imports: [AuditModule, AttachmentsModule],
  controllers: [QualityController],
  providers: [SnagsService, ReceptionsService],
  exports: [SnagsService, ReceptionsService],
})
export class QualityModule {}
