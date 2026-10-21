//backend/src/settings/settings.module.ts
import { Module } from '@nestjs/common';
import { SettingsController, ProjectSettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [SettingsController, ProjectSettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
