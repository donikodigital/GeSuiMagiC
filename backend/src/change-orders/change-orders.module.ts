//backend/src/change-orders/change-orders.module.ts
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ChangeOrdersController } from './change-orders.controller';
import { ChangeOrdersService } from './change-orders.service';

@Module({
  imports: [AuditModule],
  controllers: [ChangeOrdersController],
  providers: [ChangeOrdersService],
  exports: [ChangeOrdersService],
})
export class ChangeOrdersModule {}
