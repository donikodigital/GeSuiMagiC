// backend/src/deposits/deposits.controller.ts - v1.1
// Ajout de PATCH :id, DELETE :id, PATCH :id/archive, PATCH :id/unarchive,
// tous reserves au superadmin.

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { DepositsService } from './deposits.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { DepositQueryDto } from './dto/deposit-query.dto';
import { RejectDepositDto } from './dto/reject-deposit.dto';
import { CorrectAmountDto } from './dto/correct-amount.dto';
import { UpdateDepositDto } from './dto/update-deposit.dto';

@Controller('projects/:projectId/deposits')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class ProjectDepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Post()
  @Roles(UserRole.CLIENT)
  async create(@Param('projectId') projectId: string, @Body() dto: CreateDepositDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.depositsService.create(projectId, dto, actor);
  }

  @Get()
  async findAll(@Param('projectId') projectId: string, @Query() query: DepositQueryDto) {
    return this.depositsService.findAllForProject(projectId, query);
  }
}

@Controller('deposits')
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.depositsService.findOne(id, actor);
  }

  @Post(':id/approve')
  @Roles(UserRole.SUPERVISOR)
  async approve(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.depositsService.approve(id, actor);
  }

  @Post(':id/reject')
  @Roles(UserRole.SUPERVISOR)
  async reject(@Param('id') id: string, @Body() dto: RejectDepositDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.depositsService.reject(id, dto.reason, actor);
  }

  @Post(':id/correct')
  @Roles(UserRole.SUPERADMIN)
  async correct(@Param('id') id: string, @Body() dto: CorrectAmountDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.depositsService.correctAmount(id, dto.newAmount, dto.reason, actor);
  }

  @Patch(':id')
  @Roles(UserRole.SUPERADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateDepositDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.depositsService.update(id, dto, actor);
  }

  @Delete(':id')
  @Roles(UserRole.SUPERADMIN)
  async remove(@Param('id') id: string, @Body() dto: RejectDepositDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.depositsService.remove(id, dto.reason, actor);
  }

  @Patch(':id/archive')
  @Roles(UserRole.SUPERADMIN)
  async archive(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.depositsService.setArchived(id, true, actor);
  }

  @Patch(':id/unarchive')
  @Roles(UserRole.SUPERADMIN)
  async unarchive(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.depositsService.setArchived(id, false, actor);
  }
}