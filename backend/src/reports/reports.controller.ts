import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { ReportsService } from './reports.service';

@Controller('projects/:projectId/report')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('pdf')
  async pdf(@Param('projectId') projectId: string, @Res() res: Response) {
    const { buffer, filename } = await this.reportsService.generatePdf(projectId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('excel')
  async excel(@Param('projectId') projectId: string, @Res() res: Response) {
    const { buffer, filename } = await this.reportsService.generateExcel(projectId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
