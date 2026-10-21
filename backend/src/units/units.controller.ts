//backend/src/units/units.controller.ts
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { CatalogueQueryDto } from '../common/dto/catalogue-query.dto';
import { UnitsService } from './units.service';
import { UpsertUnitDto } from './dto/upsert-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

/** Meme logique d'acces que les categories (catalogue global + prive du client). */
@Controller('units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Post()
  @Roles(UserRole.SUPERADMIN, UserRole.CLIENT)
  async create(@Body() dto: UpsertUnitDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.unitsService.create(dto, actor);
  }

  @Get()
  async findAll(@Query() query: CatalogueQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.unitsService.findAll(actor, query.includeInactive === true);
  }

  @Patch(':id')
  @Roles(UserRole.SUPERADMIN, UserRole.CLIENT)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUnitDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.unitsService.update(id, dto, actor);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.SUPERADMIN, UserRole.CLIENT)
  async deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.unitsService.setActive(id, false, actor);
  }

  @Patch(':id/reactivate')
  @Roles(UserRole.SUPERADMIN, UserRole.CLIENT)
  async reactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.unitsService.setActive(id, true, actor);
  }

  @Delete(':id')
  @Roles(UserRole.SUPERADMIN, UserRole.CLIENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.unitsService.remove(id, actor);
  }
}
