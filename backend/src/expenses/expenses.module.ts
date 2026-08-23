import { Module } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ExpensesController, ProjectExpensesController } from './expenses.controller';
import { WalletsModule } from '../wallets/wallets.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BudgetsModule } from '../budgets/budgets.module';

@Module({
  imports: [WalletsModule, AuditModule, NotificationsModule, BudgetsModule],
  controllers: [ProjectExpensesController, ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
