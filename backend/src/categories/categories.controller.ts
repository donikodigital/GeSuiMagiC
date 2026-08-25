//backend/src/categories/categories.controller.ts - v1.1
// Seul changement : create() accepte desormais aussi SUPERVISOR (en plus de
// SUPERADMIN) - un superviseur doit pouvoir ajouter une categorie manquante
// en cours de saisie de depense, sans attendre un superadmin. update/
// deactivate/reactivate restent reserves au superadmin.

import { Body, Controller, Get, Injectable, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/exceptions/app.exception';
import { UpsertCategoryDto } from './dto/upsert-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: UpsertCategoryDto, actor: AuthenticatedUser) {
    const category = await this.prisma.expenseCategory.create({ data: { name: dto.name, group: dto.group, isActive: dto.isActive ?? true } });
    await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'CREATE', entityType: 'ExpenseCategory', entityId: category.id, newValue: dto });
    return category;
  }

  async findAll(includeInactive: boolean) {
    return this.prisma.expenseCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ group: 'asc' }, { name: 'asc' }],
    });
  }

  async update(id: string, dto: UpsertCategoryDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!existing) throw AppException.notFound('Categorie');
    const updated = await this.prisma.expenseCategory.update({ where: { id }, data: dto });
    await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'ExpenseCategory', entityId: id, oldValue: existing, newValue: updated });
    return updated;
  }

  async setActive(id: string, isActive: boolean, actor: AuthenticatedUser) {
    const updated = await this.prisma.expenseCategory.update({ where: { id }, data: { isActive } });
    await this.audit.log({ userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'ExpenseCategory', entityId: id, newValue: { isActive } });
    return updated;
  }
}

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Roles(UserRole.SUPERADMIN, UserRole.SUPERVISOR)
  async create(@Body() dto: UpsertCategoryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.categoriesService.create(dto, actor);
  }

  @Get()
  async findAll(@Query('includeInactive') includeInactive?: string) {
    return this.categoriesService.findAll(includeInactive === 'true');
  }

  @Patch(':id')
  @Roles(UserRole.SUPERADMIN)
  async update(@Param('id') id: string, @Body() dto: UpsertCategoryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.categoriesService.update(id, dto, actor);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.SUPERADMIN)
  async deactivate(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.categoriesService.setActive(id, false, actor);
  }

  @Patch(':id/reactivate')
  @Roles(UserRole.SUPERADMIN)
  async reactivate(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.categoriesService.setActive(id, true, actor);
  }
}