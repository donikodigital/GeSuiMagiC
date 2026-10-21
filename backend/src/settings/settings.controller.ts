//backend/src/settings/settings.controller.ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { SettingsService } from './settings.service';
import { UpsertSettingDto } from './dto/upsert-setting.dto';

@Controller('settings')
@Roles(UserRole.SUPERADMIN)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Post()
  async upsert(@Body() dto: UpsertSettingDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.settingsService.upsertGlobal(dto, actor);
  }

  @Get()
  async list() {
    return this.settingsService.listGlobal();
  }
}

@Controller('projects/:projectId/settings')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class ProjectSettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Post()
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async upsert(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: UpsertSettingDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.settingsService.upsertForProject(projectId, dto, actor);
  }

  @Get()
  async list(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.settingsService.listForProject(projectId);
  }
}
