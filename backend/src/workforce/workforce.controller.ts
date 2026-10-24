//backend/src/workforce/workforce.controller.ts
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { OptionalBooleanQuery } from '../common/validators/boolean-query.decorator';
import { PayrollService } from './payroll.service';
import { WorkforceService } from './workforce.service';
import { CreateAdvanceDto, CreatePayRunDto, CreateWorkerDto, EditPayRunLinesDto, PresenceQueryDto, SetPresencesDto, SubmitPayRunDto, UpdateWorkerDto } from './dto/workforce.dto';

class WorkerListQuery {
  @OptionalBooleanQuery() includeInactive?: boolean;
}

/** Ouvriers nominatifs, presences, avances et paies. */
@Controller('projects/:projectId')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class WorkforceController {
  constructor(
    private readonly workforce: WorkforceService,
    private readonly payroll: PayrollService,
  ) {}

  @Get('workers')
  async listWorkers(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() query: WorkerListQuery) {
    return this.workforce.listWorkers(projectId, !!query.includeInactive);
  }

  @Post('workers')
  async createWorker(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateWorkerDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.workforce.createWorker(projectId, dto, actor);
  }

  @Patch('workers/:workerId')
  async updateWorker(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('workerId', ParseUUIDPipe) workerId: string, @Body() dto: UpdateWorkerDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.workforce.updateWorker(projectId, workerId, dto, actor);
  }

  @Get('worker-presences')
  async listPresences(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() query: PresenceQueryDto) {
    return this.workforce.listPresences(projectId, query);
  }

  @Put('worker-presences')
  async setPresences(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: SetPresencesDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.workforce.setPresences(projectId, dto, actor);
  }

  @Get('workers/:workerId/advances')
  async listAdvances(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('workerId', ParseUUIDPipe) workerId: string) {
    return this.workforce.listAdvances(projectId, workerId);
  }

  @Post('workers/:workerId/advances')
  async createAdvance(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('workerId', ParseUUIDPipe) workerId: string, @Body() dto: CreateAdvanceDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.workforce.createAdvance(projectId, workerId, dto, actor);
  }

  @Get('pay-runs')
  async listPayRuns(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.payroll.list(projectId);
  }

  @Get('pay-runs/:id')
  async findPayRun(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.findOne(projectId, id);
  }

  @Post('pay-runs')
  async createPayRun(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreatePayRunDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.payroll.create(projectId, dto, actor);
  }

  @Put('pay-runs/:id/lines')
  async editLines(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditPayRunLinesDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.payroll.editLines(projectId, id, dto, actor);
  }

  @Post('pay-runs/:id/submit')
  async submit(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitPayRunDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.payroll.submit(projectId, id, dto, actor);
  }

  @Delete('pay-runs/:id')
  async removePayRun(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.payroll.remove(projectId, id, actor);
  }
}
