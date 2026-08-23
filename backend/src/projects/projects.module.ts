import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { WalletsModule } from '../wallets/wallets.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [WalletsModule, AuditModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
