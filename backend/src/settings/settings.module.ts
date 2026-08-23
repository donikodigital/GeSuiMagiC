import { Module } from '@nestjs/common';
import { SettingsController, SettingsService, ProjectSettingsController } from './settings.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [SettingsController, ProjectSettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
