//backend/src/meals/meals.module.ts
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MealsController } from './meals.controller';
import { MealsService } from './meals.service';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [MealsController],
  providers: [MealsService],
})
export class MealsModule {}
