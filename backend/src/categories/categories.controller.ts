//backend/src/categories/categories.controller.ts
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { CatalogueQueryDto } from '../common/dto/catalogue-query.dto';
import { CategoriesService } from './categories.service';
import { UpsertCategoryDto } from './dto/upsert-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/**
 * Lecture : tout utilisateur connecte voit les categories globales + celles de son client.
 * Creation : superadmin (global ou pour un client), client et superviseurs (pour leur client).
 * Modification / (des)activation / suppression : superadmin, ou le client pour SES entrees privees.
 */
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Roles(UserRole.SUPERADMIN, UserRole.SUPERVISOR, UserRole.CLIENT)
  async create(@Body() dto: UpsertCategoryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.categoriesService.create(dto, actor);
  }

  @Get()
  async findAll(@Query() query: CatalogueQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.categoriesService.findAll(actor, query.includeInactive === true);
  }

  @Patch(':id')
  @Roles(UserRole.SUPERADMIN, UserRole.CLIENT)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.categoriesService.update(id, dto, actor);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.SUPERADMIN, UserRole.CLIENT)
  async deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.categoriesService.setActive(id, false, actor);
  }

  @Patch(':id/reactivate')
  @Roles(UserRole.SUPERADMIN, UserRole.CLIENT)
  async reactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.categoriesService.setActive(id, true, actor);
  }

  @Delete(':id')
  @Roles(UserRole.SUPERADMIN, UserRole.CLIENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.categoriesService.remove(id, actor);
  }
}
