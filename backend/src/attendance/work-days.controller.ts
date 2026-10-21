//backend/src/attendance/work-days.controller.ts
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { WorkDaysService } from './work-days.service';
import { UpsertWorkDayDto } from './dto/upsert-work-day.dto';
import { WorkDayQueryDto } from './dto/work-day-query.dto';

/** Calendrier des jours travailles : le superviseur saisit, le client et le superadmin consultent. */
@Controller('projects/:projectId')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class WorkDaysController {
  constructor(private readonly workDaysService: WorkDaysService) {}

  @Get('work-days')
  async listMonth(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() query: WorkDayQueryDto) {
    return this.workDaysService.listMonth(projectId, query.month);
  }

  @Get('work-summary')
  async summary(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.workDaysService.summary(projectId);
  }

  @Put('work-days/:date')
  @Roles(UserRole.SUPERVISOR, UserRole.SUPERADMIN)
  async upsert(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('date') date: string,
    @Body() dto: UpsertWorkDayDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.workDaysService.upsert(projectId, date, dto, actor);
  }

  @Delete('work-days/:date')
  @Roles(UserRole.SUPERVISOR, UserRole.SUPERADMIN)
  async remove(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('date') date: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.workDaysService.remove(projectId, date, actor);
  }
}
