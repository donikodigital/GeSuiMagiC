//backend/src/suppliers/suppliers.controller.ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto, SupplierQueryDto, UpdateSupplierDto } from './dto/supplier.dto';

@Controller('projects/:projectId/suppliers')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}

  @Get()
  async list(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() query: SupplierQueryDto) {
    return this.service.list(projectId, query);
  }

  @Get(':id')
  async findOne(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(projectId, id);
  }

  @Post()
  async create(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateSupplierDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(projectId, dto, actor);
  }

  @Patch(':id')
  async update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.update(projectId, id, dto, actor);
  }
}
