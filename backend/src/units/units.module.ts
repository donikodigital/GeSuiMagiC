//backend/src/units/units.module.ts
import { Module } from '@nestjs/common';
import { UnitsController, UnitsService } from './units.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [UnitsController],
  providers: [UnitsService],
  exports: [UnitsService],
})
export class UnitsModule {}
