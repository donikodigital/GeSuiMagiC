//backend/src/quotes/quotes.controller.ts
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { QuotesService } from './quotes.service';
import { AwardLotDto, CreateLotDto, UpdateLotDto, UpsertQuoteDto } from './dto/quote.dto';

/** Lots a chiffrer, devis et comparaison. */
@Controller('projects/:projectId/quote-lots')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class QuotesController {
  constructor(private readonly service: QuotesService) {}

  @Get()
  async list(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.service.list(projectId);
  }

  @Get(':id')
  async findOne(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(projectId, id);
  }

  @Post()
  async create(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateLotDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(projectId, dto, actor);
  }

  @Patch(':id')
  async update(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLotDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.update(projectId, id, dto, actor);
  }

  @Put(':id/quotes')
  async upsertQuote(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertQuoteDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.upsertQuote(projectId, id, dto, actor);
  }

  @Delete(':id/quotes/:quoteId')
  async deleteQuote(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.deleteQuote(projectId, id, quoteId, actor);
  }

  @Post(':id/award')
  async award(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AwardLotDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.award(projectId, id, dto, actor);
  }

  @Post(':id/close')
  async close(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.close(projectId, id, actor);
  }
}
