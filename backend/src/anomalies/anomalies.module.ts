//backend/src/anomalies/anomalies.module.ts
import { Module } from '@nestjs/common';
import { AnomaliesController, AnomaliesService, ProjectAnomaliesController } from './anomalies.controller';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [ProjectAnomaliesController, AnomaliesController],
  providers: [AnomaliesService],
  exports: [AnomaliesService],
})
export class AnomaliesModule {}
