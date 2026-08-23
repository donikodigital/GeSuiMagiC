import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { RejectExpenseDto } from './dto/reject-expense.dto';
import { CancelExpenseDto } from './dto/cancel-expense.dto';
import { CorrectExpenseDto } from './dto/correct-expense.dto';
import { UpdateExpensePaymentDto } from './dto/update-expense-payment.dto';

@Controller('projects/:projectId/expenses')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class ProjectExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @Roles(UserRole.SUPERVISOR)
  async create(@Param('projectId') projectId: string, @Body() dto: CreateExpenseDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.expensesService.create(projectId, dto, actor);
  }

  @Get()
  async findAll(@Param('projectId') projectId: string, @Query() query: ExpenseQueryDto) {
    return this.expensesService.findAllForProject(projectId, query);
  }
}

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.expensesService.findOne(id, actor);
  }

  @Post(':id/approve')
  @Roles(UserRole.CLIENT)
  async approve(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.expensesService.approve(id, actor);
  }

  @Post(':id/reject')
  @Roles(UserRole.CLIENT)
  async reject(@Param('id') id: string, @Body() dto: RejectExpenseDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.expensesService.reject(id, dto.reason, actor);
  }

  @Post(':id/cancel')
  @Roles(UserRole.SUPERADMIN)
  async cancel(@Param('id') id: string, @Body() dto: CancelExpenseDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.expensesService.cancel(id, dto.reason, actor);
  }

  @Post(':id/correct')
  @Roles(UserRole.SUPERADMIN)
  async correct(@Param('id') id: string, @Body() dto: CorrectExpenseDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.expensesService.correctAmount(id, dto.newTotal, dto.reason, actor);
  }

  @Patch(':id/payment-status')
  @Roles(UserRole.SUPERVISOR, UserRole.SUPERADMIN)
  async updatePaymentStatus(@Param('id') id: string, @Body() dto: UpdateExpensePaymentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.expensesService.updatePaymentStatus(id, dto, actor);
  }
}
