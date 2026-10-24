//backend/src/workforce/workforce.module.ts
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { PayrollService } from './payroll.service';
import { WorkforceController } from './workforce.controller';
import { WorkforceService } from './workforce.service';

@Module({
  imports: [AuditModule, ExpensesModule],
  controllers: [WorkforceController],
  providers: [WorkforceService, PayrollService],
  exports: [WorkforceService, PayrollService],
})
export class WorkforceModule {}
