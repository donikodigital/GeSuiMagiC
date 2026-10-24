//backend/src/site-logs/site-logs.controller.ts
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { SiteLogsService } from './site-logs.service';
import { CreateSiteLogDto, SiteLogQueryDto, UpdateSiteLogDto } from './dto/site-log.dto';

/** Journal de chantier. Redaction : intervenants du chantier ; lecture : aussi le client. */
@Controller('projects/:projectId/site-logs')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class SiteLogsController {
  constructor(private readonly service: SiteLogsService) {}

  @Get()
  async list(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() query: SiteLogQueryDto) {
    return this.service.list(projectId, query);
  }

  @Get(':id')
  async findOne(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(projectId, id);
  }

  @Post()
  @Roles(UserRole.SUPERVISOR, UserRole.SUPERADMIN)
  async create(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateSiteLogDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(projectId, dto, actor);
  }

  @Patch(':id')
  @Roles(UserRole.SUPERVISOR, UserRole.SUPERADMIN)
  async update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSiteLogDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.update(projectId, id, dto, actor);
  }

  @Delete(':id')
  @Roles(UserRole.SUPERADMIN)
  async remove(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.remove(projectId, id, actor);
  }
}
