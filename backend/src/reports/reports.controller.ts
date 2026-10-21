//backend/src/reports/reports.controller.ts
import { Controller, Get, Param, ParseUUIDPipe, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ProjectAccessGuard, ProjectParam } from '../common/guards/project-access.guard';
import { attachmentDisposition } from '../common/utils/file-name.util';
import { ReportsService } from './reports.service';

@Controller('projects/:projectId/report')
@UseGuards(ProjectAccessGuard)
@ProjectParam('projectId')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('pdf')
  async pdf(@Param('projectId', ParseUUIDPipe) projectId: string, @Res() res: Response) {
    const { buffer, filename } = await this.reportsService.generatePdf(projectId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', attachmentDisposition(filename));
    res.send(buffer);
  }

  @Get('excel')
  async excel(@Param('projectId', ParseUUIDPipe) projectId: string, @Res() res: Response) {
    const { buffer, filename } = await this.reportsService.generateExcel(projectId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', attachmentDisposition(filename));
    res.send(buffer);
  }
}
