//backend/src/materials/materials.controller.ts
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { MaterialQueryDto } from '../common/dto/catalogue-query.dto';
import { MaterialsService } from './materials.service';
import { UpsertMaterialDto } from './dto/upsert-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';

/** Meme logique d'acces que les categories (catalogue global + prive du client). */
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post()
  @Roles(UserRole.SUPERADMIN, UserRole.SUPERVISOR, UserRole.CLIENT)
  async create(@Body() dto: UpsertMaterialDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.materialsService.create(dto, actor);
  }

  @Get()
  async findAll(@Query() query: MaterialQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.materialsService.findAll(actor, query.categoryId, query.includeInactive === true);
  }

  @Patch(':id')
  @Roles(UserRole.SUPERADMIN, UserRole.CLIENT)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMaterialDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.materialsService.update(id, dto, actor);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.SUPERADMIN, UserRole.CLIENT)
  async deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.materialsService.setActive(id, false, actor);
  }

  @Patch(':id/reactivate')
  @Roles(UserRole.SUPERADMIN, UserRole.CLIENT)
  async reactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.materialsService.setActive(id, true, actor);
  }

  @Delete(':id')
  @Roles(UserRole.SUPERADMIN, UserRole.CLIENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.materialsService.remove(id, actor);
  }
}
