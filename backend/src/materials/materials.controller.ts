//backend/src/materials/materials.controller.ts - v1.1
// Meme changement que categories.controller.ts : create() accepte
// desormais SUPERVISOR en plus de SUPERADMIN, pour permettre d'ajouter un
// materiau/element manquant depuis le formulaire de saisie de depense.

import { Body, Controller, Get, Injectable, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/exceptions/app.exception';
import { UpsertMaterialDto } from './dto/upsert-material.dto';

@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: UpsertMaterialDto, actor: AuthenticatedUser) {
    const material = await this.prisma.material.create({
      data: { name: dto.name, categoryId: dto.categoryId, defaultUnitId: dto.defaultUnitId, isActive: dto.isActive ?? true },
    });
    await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'Material', entityId: material.id, newValue: dto });
    return material;
  }

  async findAll(categoryId: string | undefined, includeInactive: boolean) {
    return this.prisma.material.findMany({
      where: { categoryId, ...(includeInactive ? {} : { isActive: true }) },
      include: { category: true, defaultUnit: true },
      orderBy: { name: 'asc' },
    });
  }

  async update(id: string, dto: UpsertMaterialDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.material.findUnique({ where: { id } });
    if (!existing) throw AppException.notFound('Materiau');
    const updated = await this.prisma.material.update({ where: { id }, data: dto });
    await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Material', entityId: id, oldValue: existing, newValue: updated });
    return updated;
  }

  async setActive(id: string, isActive: boolean, actor: AuthenticatedUser) {
    const updated = await this.prisma.material.update({ where: { id }, data: { isActive } });
    await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Material', entityId: id, newValue: { isActive } });
    return updated;
  }
}

@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post()
  @Roles(UserRole.SUPERADMIN, UserRole.SUPERVISOR)
  async create(@Body() dto: UpsertMaterialDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.materialsService.create(dto, actor);
  }

  @Get()
  async findAll(@Query('categoryId') categoryId?: string, @Query('includeInactive') includeInactive?: string) {
    return this.materialsService.findAll(categoryId, includeInactive === 'true');
  }

  @Patch(':id')
  @Roles(UserRole.SUPERADMIN)
  async update(@Param('id') id: string, @Body() dto: UpsertMaterialDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.materialsService.update(id, dto, actor);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.SUPERADMIN)
  async deactivate(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.materialsService.setActive(id, false, actor);
  }

  @Patch(':id/reactivate')
  @Roles(UserRole.SUPERADMIN)
  async reactivate(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.materialsService.setActive(id, true, actor);
  }
}