//backend/src/anomalies/anomalies.controller.ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { AnomaliesService } from './anomalies.service';
import { CreateAnomalyDto } from './dto/create-anomaly.dto';
import { UpdateAnomalyStatusDto } from './dto/update-anomaly-status.dto';
import { AnomalyQueryDto } from './dto/anomaly-query.dto';

@Controller('projects/:projectId/anomalies')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class ProjectAnomaliesController {
  constructor(private readonly anomaliesService: AnomaliesService) {}

  @Post()
  @Roles(UserRole.CLIENT)
  async create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateAnomalyDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.anomaliesService.create(projectId, dto, actor);
  }

  @Get()
  async findAll(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() query: AnomalyQueryDto) {
    return this.anomaliesService.findAllForProject(projectId, query);
  }
}

@Controller('anomalies')
@Roles(UserRole.SUPERADMIN)
export class AnomaliesController {
  constructor(private readonly anomaliesService: AnomaliesService) {}

  @Get()
  async findAll(@Query() query: AnomalyQueryDto) {
    return this.anomaliesService.findAllForSuperadmin(query);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAnomalyStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.anomaliesService.updateStatus(id, dto, actor);
  }
}
