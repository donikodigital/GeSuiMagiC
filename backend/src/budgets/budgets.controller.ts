import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { BudgetsService } from './budgets.service';
import { UpsertBudgetDto } from './dto/upsert-budget.dto';

@Controller('projects/:projectId/budgets')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Post()
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async upsert(@Param('projectId') projectId: string, @Body() dto: UpsertBudgetDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.budgetsService.upsert(projectId, dto, actor);
  }

  @Get()
  async list(@Param('projectId') projectId: string) {
    return this.budgetsService.listForProject(projectId);
  }

  @Get('comparison')
  async comparison(@Param('projectId') projectId: string) {
    return this.budgetsService.getComparison(projectId);
  }

  @Delete(':categoryId')
  @Roles(UserRole.CLIENT, UserRole.SUPERADMIN)
  async remove(@Param('projectId') projectId: string, @Param('categoryId') categoryId: string, @CurrentUser() actor: AuthenticatedUser) {
    await this.budgetsService.remove(projectId, categoryId, actor);
    return { removed: true };
  }
}
