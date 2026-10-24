//backend/src/purchasing/purchasing.module.ts
import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuditModule } from '../audit/audit.module';
import { PurchasingController } from './purchasing.controller';
import { PurchasingService } from './purchasing.service';
import { StockService } from './stock.service';

@Module({
  imports: [AuditModule, AttachmentsModule],
  controllers: [PurchasingController],
  providers: [PurchasingService, StockService],
  exports: [PurchasingService, StockService],
})
export class PurchasingModule {}
