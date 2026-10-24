//backend/src/site-common/site-common.module.ts
import { Global, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SiteNotifierService } from './site-notifier.service';

/** Services partages par les modules de gestion de chantier (notifications aux bons destinataires). */
@Global()
@Module({
  imports: [NotificationsModule],
  providers: [SiteNotifierService],
  exports: [SiteNotifierService],
})
export class SiteCommonModule {}
