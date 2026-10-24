//backend/src/change-orders/change-orders.controller.ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { ChangeOrdersService } from './change-orders.service';
import { CancelChangeOrderDto, ChangeOrderQueryDto, CreateChangeOrderDto, DecideChangeOrderDto } from './dto/change-order.dto';

@Controller('projects/:projectId/change-orders')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class ChangeOrdersController {
  constructor(private readonly service: ChangeOrdersService) {}

  @Get()
  async list(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() query: ChangeOrderQueryDto) {
    return this.service.list(projectId, query);
  }

  @Get(':id')
  async findOne(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(projectId, id);
  }

  @Post()
  async create(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateChangeOrderDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(projectId, dto, actor);
  }

  @Post(':id/decision')
  async decide(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideChangeOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.decide(projectId, id, dto, actor);
  }

  @Post(':id/cancel')
  async cancel(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelChangeOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.cancel(projectId, id, dto, actor);
  }
}
