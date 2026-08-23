import { Body, Controller, Get, Injectable, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpsertSettingDto } from './dto/upsert-setting.dto';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async upsertGlobal(dto: UpsertSettingDto, actor: AuthenticatedUser) {
    // NB: le champ projectId etant nullable, Postgres traite chaque NULL comme
    // distinct dans l'index unique -> on ne peut pas s'appuyer sur upsert()
    // pour les reglages globaux. On fait un findFirst + create/update explicite.
    const existing = await this.prisma.setting.findFirst({ where: { key: dto.key, projectId: null } });
    const setting = existing
      ? await this.prisma.setting.update({ where: { id: existing.id }, data: { value: dto.value as Prisma.InputJsonValue, scope: 'GLOBAL' } })
      : await this.prisma.setting.create({ data: { key: dto.key, value: dto.value as Prisma.InputJsonValue, scope: 'GLOBAL' } });

    await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Setting', entityId: setting.id, newValue: dto });
    return setting;
  }

  async listGlobal() {
    return this.prisma.setting.findMany({ where: { scope: 'GLOBAL' } });
  }

  async upsertForProject(projectId: string, dto: UpsertSettingDto, actor: AuthenticatedUser) {
    const setting = await this.prisma.setting.upsert({
      where: { key_projectId: { key: dto.key, projectId } },
      update: { value: dto.value as Prisma.InputJsonValue, scope: 'PROJECT' },
      create: { key: dto.key, value: dto.value as Prisma.InputJsonValue, scope: 'PROJECT', projectId },
    });

    await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Setting', entityId: setting.id, newValue: dto });
    return setting;
  }

  async listForProject(projectId: string) {
    return this.prisma.setting.findMany({ where: { projectId } });
  }
}

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
  async upsert(@Param('projectId') projectId: string, @Body() dto: UpsertSettingDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.settingsService.upsertForProject(projectId, dto, actor);
  }

  @Get()
  async list(@Param('projectId') projectId: string) {
    return this.settingsService.listForProject(projectId);
  }
}
