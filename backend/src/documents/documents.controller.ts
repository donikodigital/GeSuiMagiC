//backend/src/documents/documents.controller.ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { DocumentsService } from './documents.service';
import { CreateProjectDocumentDto, UpdateProjectDocumentDto } from './dto/document.dto';

/** Documents reglementaires du projet (permis, assurances, garanties...). */
@Controller('projects/:projectId/documents')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get()
  async list(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.service.list(projectId);
  }

  @Get(':id')
  async findOne(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(projectId, id);
  }

  @Post()
  async create(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateProjectDocumentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(projectId, dto, actor);
  }

  @Patch(':id')
  async update(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjectDocumentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.update(projectId, id, dto, actor);
  }
}
