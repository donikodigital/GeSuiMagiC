//backend/src/supervisors/supervisors.controller.ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupervisorsService } from './supervisors.service';
import { CreateSupervisorDto } from './dto/create-supervisor.dto';
import { UpdateSupervisorDto } from './dto/update-supervisor.dto';
import { UpdateOwnSupervisorProfileDto } from './dto/update-own-profile.dto';
import { SetSupervisorStatusDto } from './dto/set-supervisor-status.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { AppException } from '../common/exceptions/app.exception';

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
    return this.supervisorsService.findAll(actor, { page: query.page ?? 1, limit: query.limit ?? 20, search: query.search });
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
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.supervisorsService.findOne(id, actor);
  }

  @Patch(':id')
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSupervisorDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.supervisorsService.update(id, dto, actor);
  }

  @Patch(':id/status')
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetSupervisorStatusDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.supervisorsService.setStatus(id, dto.status, actor);
  }

  @Patch(':id/resend-invitation')
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async resendInvitation(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.supervisorsService.resendInvitation(id, actor);
  }
}
