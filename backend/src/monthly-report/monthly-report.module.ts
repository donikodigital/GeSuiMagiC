//backend/src/monthly-report/monthly-report.module.ts
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProgressModule } from '../progress/progress.module';
import { MonthlyReportController } from './monthly-report.controller';
import { MonthlyReportService } from './monthly-report.service';

@Module({
  imports: [NotificationsModule, ProgressModule],
  controllers: [MonthlyReportController],
  providers: [MonthlyReportService],
  exports: [MonthlyReportService],
})
export class MonthlyReportModule {}
