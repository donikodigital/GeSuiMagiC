//backend/src/attendance/attendance.module.ts
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PhasesController } from './phases.controller';
import { WorkDaysController } from './work-days.controller';
import { PhasesService } from './phases.service';
import { WorkDaysService } from './work-days.service';

@Module({
  imports: [AuditModule],
  controllers: [PhasesController, WorkDaysController],
  providers: [PhasesService, WorkDaysService],
})
export class AttendanceModule {}
