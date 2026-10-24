//backend/src/quality/quality.controller.ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { attachmentDisposition } from '../common/utils/file-name.util';
import { ReceptionsService } from './receptions.service';
import { SnagsService } from './snags.service';
import { CreateReceptionDto, CreateSnagDto, SnagQueryDto, TransitionSnagDto, UpdateSnagDto } from './dto/quality.dto';

/** Qualite et reception : reserves, levee des reserves, proces-verbaux. */
@Controller('projects/:projectId')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class QualityController {
  constructor(
    private readonly snags: SnagsService,
    private readonly receptions: ReceptionsService,
  ) {}

  @Get('snags')
  async listSnags(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() query: SnagQueryDto) {
    return this.snags.list(projectId, query);
  }

  @Get('snags/:id')
  async getSnag(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.snags.findOne(projectId, id);
  }

  @Post('snags')
  async createSnag(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateSnagDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.snags.create(projectId, dto, actor);
  }

  @Patch('snags/:id')
  async updateSnag(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSnagDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.snags.update(projectId, id, dto, actor);
  }

  @Post('snags/:id/transition')
  async transition(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionSnagDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.snags.transition(projectId, id, dto, actor);
  }

  @Get('receptions')
  async listReceptions(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.receptions.list(projectId);
  }

  @Post('receptions')
  async createReception(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateReceptionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.receptions.create(projectId, dto, actor);
  }

  @Get('receptions/:id')
  async getReception(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.receptions.findOne(projectId, id);
  }

  @Post('receptions/:id/sign')
  async signReception(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.receptions.sign(projectId, id, actor);
  }

  @Get('receptions/:id/pdf')
  async receptionPdf(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { buffer, filename } = await this.receptions.pdf(projectId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', attachmentDisposition(filename));
    res.send(buffer);
  }
}
