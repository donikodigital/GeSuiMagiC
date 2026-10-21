//backend/src/meals/meals.controller.ts
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { MonthPipe } from '../common/pipes/month.pipe';
import { MealsService } from './meals.service';
import { UpsertMealEnvelopeDto } from './dto/upsert-meal-envelope.dto';
import { CreateCarryOverDto } from './dto/create-carry-over.dto';
import { DeleteCarryOverDto } from './dto/delete-carry-over.dto';
import { CreateMealRequestDto } from './dto/create-meal-request.dto';
import { AnswerMealRequestDto } from './dto/answer-meal-request.dto';
import { MealRequestQueryDto } from './dto/meal-request-query.dto';

/**
 * Alimentation des ouvriers. Lecture : client, superviseurs affectes (via le guard) et superadmin.
 * Enveloppe et reports : client et superadmin. Reponse aux demandes de comptes : superviseur et superadmin.
 */
@Controller('projects/:projectId/meals')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class MealsController {
  constructor(private readonly mealsService: MealsService) {}

  @Get('months')
  async listMonths(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.mealsService.listMonths(projectId);
  }

  @Get('months/:month')
  async getMonth(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('month', MonthPipe) month: string) {
    return this.mealsService.getMonth(projectId, month);
  }

  @Put('months/:month')
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async upsertEnvelope(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('month', MonthPipe) month: string,
    @Body() dto: UpsertMealEnvelopeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.mealsService.upsertEnvelope(projectId, month, dto, actor);
  }

  @Post('months/:month/carry-over')
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async createCarryOver(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('month', MonthPipe) month: string,
    @Body() dto: CreateCarryOverDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.mealsService.createCarryOver(projectId, month, dto, actor);
  }

  @Delete('carry-overs/:carryOverId')
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async deleteCarryOver(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('carryOverId', ParseUUIDPipe) carryOverId: string,
    @Body() dto: DeleteCarryOverDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.mealsService.deleteCarryOver(projectId, carryOverId, dto, actor);
  }

  @Get('requests')
  async listRequests(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() query: MealRequestQueryDto) {
    return this.mealsService.listRequests(projectId, query);
  }

  @Post('months/:month/requests')
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async createRequest(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('month', MonthPipe) month: string,
    @Body() dto: CreateMealRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.mealsService.createRequest(projectId, month, dto, actor);
  }

  @Post('requests/:requestId/answer')
  @Roles(UserRole.SUPERVISOR, UserRole.SUPERADMIN)
  async answerRequest(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: AnswerMealRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.mealsService.answerRequest(projectId, requestId, dto, actor);
  }

  @Post('requests/:requestId/close')
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async closeRequest(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.mealsService.closeRequest(projectId, requestId, actor);
  }
}
