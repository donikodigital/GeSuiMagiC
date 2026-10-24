//backend/src/progress/progress.module.ts
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PhaseCostsService } from './phase-costs.service';
import { PlanningService } from './planning.service';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

@Module({
  imports: [AuditModule],
  controllers: [ProgressController],
  providers: [ProgressService, PhaseCostsService, PlanningService],
  exports: [ProgressService, PhaseCostsService, PlanningService],
})
export class ProgressModule {}
