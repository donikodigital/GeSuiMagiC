//backend/src/notifications/notifications.module.ts
import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { MessagingService } from './messaging.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, MessagingService],
  exports: [NotificationsService, MessagingService],
})
export class NotificationsModule {}
