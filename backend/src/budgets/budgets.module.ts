import { Module } from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { BudgetsController } from './budgets.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [BudgetsController],
  providers: [BudgetsService],
  exports: [BudgetsService],
})
export class BudgetsModule {}
