//backend/src/projects/projects.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ProjectStatus, UserRole } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { AppException } from '../common/exceptions/app.exception';
import { ProjectsService } from './projects.service';
import { WalletsService } from '../wallets/wallets.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateProjectFinancialsDto } from './dto/update-project-financials.dto';
import { ProjectQueryDto } from './dto/project-query.dto';

class UpdateStatusDto {
  @IsEnum(ProjectStatus)
  status: ProjectStatus;
}

class AssignSupervisorDto {
  @IsString()
  @IsNotEmpty()
  supervisorId: string;
}

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly wallets: WalletsService,
  ) {}

  @Post()
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async create(@Body() dto: CreateProjectDto, @CurrentUser() actor: AuthenticatedUser) {
    const clientId = actor.role === 'CLIENT' ? actor.clientProfileId! : dto.clientId;
    if (!clientId) throw AppException.badRequest('CLIENT_ID_REQUIRED', 'clientId est requis pour une creation par le superadmin.');
    return this.projectsService.create(dto, clientId, actor);
  }

  @Get()
  async findAll(@Query() query: ProjectQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.projectsService.findAll(query, actor);
  }

  @Get(':id')
  @UseGuards(ProjectAccessGuard)
  @ProjectParam('id')
  async findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Get(':id/financial-summary')
  @UseGuards(ProjectAccessGuard)
  @ProjectParam('id')
  async financialSummary(@Param('id') id: string) {
    return this.wallets.getFinancialSummary(id);
  }

  @Patch(':id')
  @UseGuards(ProjectAccessGuard)
  @ProjectParam('id')
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateProjectDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.projectsService.updateNonFinancial(id, dto, actor);
  }

  @Patch(':id/financials')
  @UseGuards(ProjectAccessGuard)
  @ProjectParam('id')
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async updateFinancials(@Param('id') id: string, @Body() dto: UpdateProjectFinancialsDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.projectsService.updateFinancials(id, dto, actor);
  }

  @Patch(':id/status')
  @UseGuards(ProjectAccessGuard)
  @ProjectParam('id')
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.projectsService.updateStatus(id, dto.status, actor);
  }

  @Get(':id/supervisors')
  @UseGuards(ProjectAccessGuard)
  @ProjectParam('id')
  async listSupervisors(@Param('id') id: string) {
    return this.projectsService.listSupervisors(id);
  }

  @Post(':id/supervisors')
  @UseGuards(ProjectAccessGuard)
  @ProjectParam('id')
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async assignSupervisor(@Param('id') id: string, @Body() dto: AssignSupervisorDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.projectsService.assignSupervisor(id, dto.supervisorId, actor);
  }

  @Delete(':id/supervisors/:supervisorId')
  @UseGuards(ProjectAccessGuard)
  @ProjectParam('id')
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async revokeSupervisor(@Param('id') id: string, @Param('supervisorId') supervisorId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.projectsService.revokeSupervisor(id, supervisorId, actor);
  }

  @Delete(':id')
  @UseGuards(ProjectAccessGuard)
  @ProjectParam('id')
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.projectsService.remove(id, actor);
  }
}