//backend/src/attendance/phases.controller.ts
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { PhasesService } from './phases.service';
import { CreatePhaseDto } from './dto/create-phase.dto';
import { UpdatePhaseDto } from './dto/update-phase.dto';
import { ReorderPhasesDto } from './dto/reorder-phases.dto';

/** Etapes du chantier. Lecture et gestion : client, superviseurs affectes (via le guard) et superadmin. */
@Controller('projects/:projectId/phases')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class PhasesController {
  constructor(private readonly phasesService: PhasesService) {}

  @Get()
  async list(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.phasesService.list(projectId);
  }

  @Post()
  async create(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreatePhaseDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.phasesService.create(projectId, dto, actor);
  }

  @Post('defaults')
  async createDefaults(@Param('projectId', ParseUUIDPipe) projectId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.phasesService.createDefaults(projectId, actor);
  }

  // Declaree AVANT ':phaseId' pour que "reorder" ne soit pas lu comme un identifiant.
  @Patch('reorder')
  async reorder(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: ReorderPhasesDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.phasesService.reorder(projectId, dto, actor);
  }

  @Patch(':phaseId')
  async update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('phaseId', ParseUUIDPipe) phaseId: string,
    @Body() dto: UpdatePhaseDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.phasesService.update(projectId, phaseId, dto, actor);
  }

  @Delete(':phaseId')
  async remove(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('phaseId', ParseUUIDPipe) phaseId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.phasesService.remove(projectId, phaseId, actor);
  }
}
