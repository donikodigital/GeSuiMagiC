import { downloadFile } from '@/lib/api-client';

export const reportsService = {
  downloadPdf: (projectId: string, projectName: string) =>
    downloadFile(`/projects/${projectId}/report/pdf`, `rapport-${projectName}.pdf`),
  downloadExcel: (projectId: string, projectName: string) =>
    downloadFile(`/projects/${projectId}/report/excel`, `export-${projectName}.xlsx`),
};
