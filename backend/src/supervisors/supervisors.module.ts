import { Module } from '@nestjs/common';
import { SupervisorsService } from './supervisors.service';
import { SupervisorsController } from './supervisors.controller';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [SupervisorsController],
  providers: [SupervisorsService],
  exports: [SupervisorsService],
})
export class SupervisorsModule {}
