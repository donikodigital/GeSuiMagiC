//backend/src/quotes/quotes.module.ts
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ContractsModule } from '../contracts/contracts.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [AuditModule, ContractsModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
