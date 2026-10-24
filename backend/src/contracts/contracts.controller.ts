//backend/src/contracts/contracts.controller.ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { ContractsService } from './contracts.service';
import { CancelContractDto, CreateContractDto, DecideStatementDto, RecordContractPaymentDto, SubmitStatementDto, UpdateContractDto } from './dto/contract.dto';

/** Marches de sous-traitance, situations de travaux et paiements. */
@Controller('projects/:projectId/contracts')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  @Get()
  async list(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.service.list(projectId);
  }

  @Get(':id')
  async findOne(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(projectId, id);
  }

  @Post()
  async create(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateContractDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(projectId, dto, actor);
  }

  @Patch(':id')
  async update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.update(projectId, id, dto, actor);
  }

  @Post(':id/complete')
  async complete(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.complete(projectId, id, actor);
  }

  @Post(':id/cancel')
  async cancel(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelContractDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.cancel(projectId, id, dto, actor);
  }

  @Post(':id/statements')
  async submitStatement(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitStatementDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.submitStatement(projectId, id, dto, actor);
  }

  @Post(':id/statements/:statementId/decision')
  async decideStatement(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('statementId', ParseUUIDPipe) statementId: string,
    @Body() dto: DecideStatementDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.decideStatement(projectId, id, statementId, dto, actor);
  }

  @Post(':id/payments')
  async recordPayment(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordContractPaymentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.recordPayment(projectId, id, dto, actor);
  }
}
