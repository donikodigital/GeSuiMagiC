// backend/src/supervisors/supervisors.controller.ts - v1.1
// Ajout de GET /supervisors/me et PATCH /supervisors/me, reserves au role
// SUPERVISOR, pour qu'il puisse enfin consulter/modifier son propre profil
// (jusqu'ici PATCH /supervisors/:id etait reserve a CLIENT/SUPERADMIN).
// Places avant @Get(':id') / @Patch(':id') pour que NestJS ne traite pas
// "me" comme une valeur de :id.

import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { IsIn } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupervisorsService } from './supervisors.service';
import { CreateSupervisorDto } from './dto/create-supervisor.dto';
import { UpdateSupervisorDto } from './dto/update-supervisor.dto';
import { UpdateOwnSupervisorProfileDto } from './dto/update-own-profile.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { AppException } from '../common/exceptions/app.exception';

class SetStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED', 'DISABLED'])
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
}

@Controller('supervisors')
export class SupervisorsController {
  constructor(private readonly supervisorsService: SupervisorsService) {}

  @Post()
  @Roles(UserRole.CLIENT)
  async create(@Body() dto: CreateSupervisorDto, @CurrentUser() actor: AuthenticatedUser) {
    if (!actor.clientProfileId) throw AppException.forbiddenProjectAccess();
    return this.supervisorsService.create(dto, actor.clientProfileId, actor);
  }

  @Get()
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async findAll(@Query() query: PaginationQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    const clientId = actor.role === 'CLIENT' ? actor.clientProfileId : undefined;
    return this.supervisorsService.findAll(clientId, { page: query.page ?? 1, limit: query.limit ?? 20, search: query.search });
  }

  /** Le superviseur consulte son propre profil. */
  @Get('me')
  @Roles(UserRole.SUPERVISOR)
  async me(@CurrentUser() actor: AuthenticatedUser) {
    if (!actor.supervisorProfileId) throw AppException.notFound('Superviseur');
    return this.supervisorsService.findOne(actor.supervisorProfileId, actor);
  }

  @Patch('me')
  @Roles(UserRole.SUPERVISOR)
  async updateMe(@Body() dto: UpdateOwnSupervisorProfileDto, @CurrentUser() actor: AuthenticatedUser) {
    if (!actor.supervisorProfileId) throw AppException.notFound('Superviseur');
    return this.supervisorsService.updateOwnProfile(actor.supervisorProfileId, dto, actor);
  }

  @Get(':id')
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.supervisorsService.findOne(id, actor);
  }

  @Patch(':id')
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateSupervisorDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.supervisorsService.update(id, dto, actor);
  }

  @Patch(':id/status')
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async setStatus(@Param('id') id: string, @Body() dto: SetStatusDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.supervisorsService.setStatus(id, dto.status, actor);
  }
}