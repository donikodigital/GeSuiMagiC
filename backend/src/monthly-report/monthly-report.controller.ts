//backend/src/monthly-report/monthly-report.controller.ts
import { Controller, Get, Param, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { IsOptional, Matches } from 'class-validator';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { attachmentDisposition } from '../common/utils/file-name.util';
import { MONTH_REGEX } from '../common/utils/month.util';
import { MonthlyReportService } from './monthly-report.service';

class MonthQuery {
  @IsOptional() @Matches(MONTH_REGEX, { message: 'Le mois doit être au format AAAA-MM.' })
  month?: string;
}

@Controller('projects/:projectId/monthly-report')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class MonthlyReportController {
  constructor(private readonly service: MonthlyReportService) {}

  @Get()
  async data(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() query: MonthQuery) {
    return this.service.getData(projectId, query.month);
  }

  @Get('pdf')
  async pdf(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() query: MonthQuery, @Res() res: Response) {
    const { buffer, filename } = await this.service.getPdf(projectId, query.month);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', attachmentDisposition(filename));
    res.send(buffer);
  }
}
