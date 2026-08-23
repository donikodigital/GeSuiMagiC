import { Module } from '@nestjs/common';
import { DepositsService } from './deposits.service';
import { DepositsController, ProjectDepositsController } from './deposits.controller';
import { WalletsModule } from '../wallets/wallets.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [WalletsModule, AuditModule, NotificationsModule],
  controllers: [ProjectDepositsController, DepositsController],
  providers: [DepositsService],
  exports: [DepositsService],
})
export class DepositsModule {}
