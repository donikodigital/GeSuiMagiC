// backend/src/units/units.controller.ts - v1.2
// Ajout de update() (PATCH :id - absent jusqu'ici, seuls deactivate/
// reactivate existaient) et remove() (DELETE :id), reserve au superadmin :
// suppression definitive autorisee uniquement si aucun materiau ne
// reference cette unite comme unite par defaut.

import { Body, Controller, Delete, Get, Injectable, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/exceptions/app.exception';
import { UpsertUnitDto } from './dto/upsert-unit.dto';

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: UpsertUnitDto, actor: AuthenticatedUser) {
    const unit = await this.prisma.unit.create({ data: { name: dto.name, symbol: dto.symbol, isActive: dto.isActive ?? true } });
    await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'Unit', entityId: unit.id, newValue: dto });
    return unit;
  }

  async findAll(includeInactive: boolean) {
    return this.prisma.unit.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: { name: 'asc' } });
  }

  async update(id: string, dto: UpsertUnitDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.unit.findUnique({ where: { id } });
    if (!existing) throw AppException.notFound('Unite');
    const updated = await this.prisma.unit.update({ where: { id }, data: dto });
    await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Unit', entityId: id, oldValue: existing, newValue: updated });
    return updated;
  }

  async setActive(id: string, isActive: boolean, actor: AuthenticatedUser) {
    const updated = await this.prisma.unit.update({ where: { id }, data: { isActive } });
    await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Unit', entityId: id, newValue: { isActive } });
    return updated;
  }

  /** Suppression definitive : uniquement si aucun materiau ne l'utilise comme unite par defaut. */
  async remove(id: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.unit.findUnique({ where: { id } });
    if (!existing) throw AppException.notFound('Unite');

    const materialsCount = await this.prisma.material.count({ where: { defaultUnitId: id } });
    if (materialsCount > 0) {
      throw AppException.conflict(
        'UNIT_IN_USE',
        `Cette unite est utilisee comme unite par defaut de ${materialsCount} materiau(x) et ne peut pas etre supprimee. Desactivez-la plutot pour la retirer des nouvelles saisies.`,
      );
    }

    await this.prisma.unit.delete({ where: { id } });
    await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'DELETE_SOFT', entityType: 'Unit', entityId: id, oldValue: existing });
    return { removed: true };
  }
}

@Controller('units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Post()
  @Roles(UserRole.SUPERADMIN, UserRole.CLIENT)
  async create(@Body() dto: UpsertUnitDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.unitsService.create(dto, actor);
  }

  @Get()
  async findAll(@Query('includeInactive') includeInactive?: string) {
    return this.unitsService.findAll(includeInactive === 'true');
  }

  @Patch(':id')
  @Roles(UserRole.SUPERADMIN)
  async update(@Param('id') id: string, @Body() dto: UpsertUnitDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.unitsService.update(id, dto, actor);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.SUPERADMIN)
  async deactivate(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.unitsService.setActive(id, false, actor);
  }

  @Patch(':id/reactivate')
  @Roles(UserRole.SUPERADMIN)
  async reactivate(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.unitsService.setActive(id, true, actor);
  }

  @Delete(':id')
  @Roles(UserRole.SUPERADMIN)
  async remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.unitsService.remove(id, actor);
  }
}