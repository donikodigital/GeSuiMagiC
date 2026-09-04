//backend/src/clients/clients.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { UpdateOwnClientProfileDto } from './dto/update-own-profile.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { AppException } from '../common/exceptions/app.exception';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @Roles(UserRole.SUPERADMIN)
  async create(@Body() dto: CreateClientDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.clientsService.create(dto, actor);
  }

  @Get()
  @Roles(UserRole.SUPERADMIN)
  async findAll(@Query() query: PaginationQueryDto) {
    return this.clientsService.findAll({ page: query.page ?? 1, limit: query.limit ?? 20, search: query.search });
  }

  /** Le client consulte son propre profil (section 5). */
  @Get('me')
  @Roles(UserRole.CLIENT)
  async me(@CurrentUser() actor: AuthenticatedUser) {
    if (!actor.clientProfileId) throw AppException.notFound('Client');
    return this.clientsService.findOne(actor.clientProfileId);
  }

  @Patch('me')
  @Roles(UserRole.CLIENT)
  async updateMe(@Body() dto: UpdateOwnClientProfileDto, @CurrentUser() actor: AuthenticatedUser) {
    if (!actor.clientProfileId) throw AppException.notFound('Client');
    return this.clientsService.updateOwnProfile(actor.clientProfileId, dto, actor);
  }

  @Get(':id')
  @Roles(UserRole.SUPERADMIN)
  async findOne(@Param('id') id: string) {
    return this.clientsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPERADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateClientDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.clientsService.update(id, dto, actor);
  }

  @Patch(':id/suspend')
  @Roles(UserRole.SUPERADMIN)
  async suspend(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.clientsService.setSuspended(id, true, actor);
  }

  @Patch(':id/reactivate')
  @Roles(UserRole.SUPERADMIN)
  async reactivate(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.clientsService.setSuspended(id, false, actor);
  }

  @Patch(':id/resend-invitation')
  @Roles(UserRole.SUPERADMIN)
  async resendInvitation(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.clientsService.resendInvitation(id, actor);
  }

  @Delete(':id')
  @Roles(UserRole.SUPERADMIN)
  async remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.clientsService.remove(id, actor);
  }
}