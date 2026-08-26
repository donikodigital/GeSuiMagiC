// backend/src/units/units.controller.ts - v1.1
// Ajout de CLIENT sur create(), meme raisonnement.

import { Body, Controller, Get, Injectable, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
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

  async setActive(id: string, isActive: boolean, actor: AuthenticatedUser) {
    const updated = await this.prisma.unit.update({ where: { id }, data: { isActive } });
    await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Unit', entityId: id, newValue: { isActive } });
    return updated;
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
}