//backend/src/progress/progress.controller.ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { PhaseCostsService } from './phase-costs.service';
import { PlanningService } from './planning.service';
import { ProgressService } from './progress.service';
import { DecideProgressDto, ProgressUpdatesQueryDto, SubmitProgressDto } from './dto/progress.dto';

/** Cout par etape, avancement valide et planning. Lecture : client, superviseurs affectes, superadmin. */
@Controller('projects/:projectId')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class ProgressController {
  constructor(
    private readonly progress: ProgressService,
    private readonly phaseCosts: PhaseCostsService,
    private readonly planning: PlanningService,
  ) {}

  @Get('phase-costs')
  async costs(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.phaseCosts.get(projectId);
  }

  @Get('planning')
  async getPlanning(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.planning.get(projectId);
  }

  @Get('progress')
  async overview(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.progress.overview(projectId);
  }

  @Get('progress/updates')
  async history(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() query: ProgressUpdatesQueryDto) {
    return this.progress.history(projectId, query);
  }

  @Post('progress')
  async submit(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: SubmitProgressDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.progress.submit(projectId, dto, actor);
  }

  @Post('progress/updates/:updateId/decision')
  async decide(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('updateId', ParseUUIDPipe) updateId: string,
    @Body() dto: DecideProgressDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.progress.decide(projectId, updateId, dto, actor);
  }
}
