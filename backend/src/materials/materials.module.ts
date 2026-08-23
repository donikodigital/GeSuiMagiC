import { Module } from '@nestjs/common';
import { MaterialsController, MaterialsService } from './materials.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [MaterialsController],
  providers: [MaterialsService],
  exports: [MaterialsService],
})
export class MaterialsModule {}
