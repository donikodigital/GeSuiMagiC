//backend/src/contracts/contracts.module.ts
import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuditModule } from '../audit/audit.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

@Module({
  imports: [AuditModule, AttachmentsModule, ExpensesModule],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
