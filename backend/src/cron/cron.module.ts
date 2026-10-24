//backend/src/cron/cron.module.ts
import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { MonthlyReportModule } from '../monthly-report/monthly-report.module';
import { ProgressModule } from '../progress/progress.module';
import { CronController } from './cron.controller';
import { CronService } from './cron.service';

@Module({
  imports: [DocumentsModule, MonthlyReportModule, ProgressModule],
  controllers: [CronController],
  providers: [CronService],
})
export class CronModule {}
