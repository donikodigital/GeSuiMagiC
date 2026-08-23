import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { formatMoney } from '../common/utils/money.util';
import { AppException } from '../common/exceptions/app.exception';

interface ReportRow {
  date: Date;
  type: 'Depot' | 'Depense';
  label: string;
  quantity: string;
  unitPrice: string;
  total: string;
  observation: string;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadProjectData(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { client: true, wallet: true },
    });
    if (!project) throw AppException.notFound('Projet');

    const [deposits, expenses] = await Promise.all([
      this.prisma.deposit.findMany({ where: { projectId, status: 'APPROVED' }, orderBy: { date: 'asc' } }),
      this.prisma.expense.findMany({ where: { projectId, status: 'APPROVED' }, include: { category: true }, orderBy: { date: 'asc' } }),
    ]);

    return { project, deposits, expenses };
  }

  private buildRows(deposits: any[], expenses: any[]): ReportRow[] {
    const rows: ReportRow[] = [
      ...deposits.map((d) => ({
        date: d.date,
        type: 'Depot' as const,
        label: d.motif || 'Depot de fonds',
        quantity: '-',
        unitPrice: '-',
        total: `+${formatMoney(d.amount, d.currency)}`,
        observation: d.observation || '',
      })),
      ...expenses.map((e) => ({
        date: e.date,
        type: 'Depense' as const,
        label: `${e.category?.name ?? ''} - ${e.label}`,
        quantity: String(e.quantity),
        unitPrice: formatMoney(e.unitPrice, ''),
        total: `-${formatMoney(e.total, '')}`,
        observation: e.observation || '',
      })),
    ];
    return rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  // --------------------------------------------------------------------
  // PDF (section 38)
  // --------------------------------------------------------------------
  async generatePdf(projectId: string): Promise<{ buffer: Buffer; filename: string }> {
    const { project, deposits, expenses } = await this.loadProjectData(projectId);
    const rows = this.buildRows(deposits, expenses);

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    const pageWidth = doc.page.width - 80;

    // --- En-tete ---
    doc.fontSize(16).font('Helvetica-Bold').text('Suivi de Chantier - Rapport financier', { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#444444');
    doc.text(`Client : ${project.client.firstName} ${project.client.lastName}`);
    doc.text(`Projet : ${project.name}`);
    doc.text(`Localisation : ${[project.location, project.city, project.country].filter(Boolean).join(', ') || '-'}`);
    doc.text(`Identifiant du projet : ${project.id}`);
    doc.text(`Date de generation : ${new Date().toLocaleString('fr-FR')}`);
    doc.fillColor('#000000');
    doc.moveDown(1);

    // --- Tableau ---
    const columns = [
      { key: 'date', label: 'Date', width: 60 },
      { key: 'label', label: 'Libelle', width: 155 },
      { key: 'quantity', label: 'Qte', width: 45 },
      { key: 'unitPrice', label: 'P.U.', width: 70 },
      { key: 'total', label: 'Total', width: 90 },
      { key: 'observation', label: 'Observation', width: pageWidth - (60 + 155 + 45 + 70 + 90) },
    ];

    const drawHeader = () => {
      let x = doc.x;
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
      doc.rect(x, y, pageWidth, 18).fill('#0f172a');
      doc.fillColor('#ffffff');
      let cx = x + 4;
      for (const col of columns) {
        doc.text(col.label, cx, y + 5, { width: col.width - 6, ellipsis: true });
        cx += col.width;
      }
      doc.fillColor('#000000');
      doc.moveDown(1.3);
    };

    drawHeader();
    doc.font('Helvetica').fontSize(8);

    for (const row of rows) {
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
        drawHeader();
        doc.font('Helvetica').fontSize(8);
      }
      const y = doc.y;
      let cx = doc.x + 4;
      const values = [
        row.date.toLocaleDateString('fr-FR'),
        row.label,
        row.quantity,
        row.unitPrice,
        row.total,
        row.observation,
      ];
      values.forEach((val, i) => {
        doc.text(String(val), cx, y, { width: columns[i].width - 6, ellipsis: true });
        cx += columns[i].width;
      });
      doc.moveDown(0.9);
    }

    // --- Recapitulatif ---
    if (doc.y > doc.page.height - 160) doc.addPage();
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(11).text('Recapitulatif');
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(10);
    doc.text(`Budget estime : ${formatMoney(project.budget, project.currency)}`);
    doc.text(`Total des depots : ${formatMoney(project.wallet?.totalDeposited ?? 0, project.currency)}`);
    doc.text(`Total des depenses : ${formatMoney(project.wallet?.totalSpent ?? 0, project.currency)}`);
    doc.font('Helvetica-Bold').text(`Solde restant : ${formatMoney(project.wallet?.balance ?? 0, project.currency)}`);
    doc.font('Helvetica').moveDown(0.4);
    doc.text(`Nombre de transactions : ${rows.length}`);
    if (rows.length > 0) {
      doc.text(
        `Periode couverte : ${rows[0].date.toLocaleDateString('fr-FR')} - ${rows[rows.length - 1].date.toLocaleDateString('fr-FR')}`,
      );
    }

    doc.end();

    const buffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    return { buffer, filename: `rapport-${project.name.replace(/\s+/g, '_')}-${Date.now()}.pdf` };
  }

  // --------------------------------------------------------------------
  // EXCEL (section 39)
  // --------------------------------------------------------------------
  async generateExcel(projectId: string): Promise<{ buffer: Buffer; filename: string }> {
    const { project, deposits, expenses } = await this.loadProjectData(projectId);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Suivi de Chantier';
    workbook.created = new Date();

    // --- Feuille Recapitulatif ---
    const summarySheet = workbook.addWorksheet('Recapitulatif');
    summarySheet.columns = [{ width: 30 }, { width: 25 }];
    summarySheet.addRows([
      ['Projet', project.name],
      ['Client', `${project.client.firstName} ${project.client.lastName}`],
      ['Budget estime', Number(project.budget)],
      ['Total depots', Number(project.wallet?.totalDeposited ?? 0)],
      ['Total depenses', Number(project.wallet?.totalSpent ?? 0)],
      ['Solde restant', Number(project.wallet?.balance ?? 0)],
      ['Devise', project.currency],
      ['Date de generation', new Date().toLocaleString('fr-FR')],
    ]);
    summarySheet.getColumn(1).font = { bold: true };

    // --- Feuille Depots ---
    const depositSheet = workbook.addWorksheet('Depots');
    depositSheet.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Montant', key: 'amount', width: 16 },
      { header: 'Devise', key: 'currency', width: 10 },
      { header: 'Motif', key: 'motif', width: 30 },
      { header: 'Mode de versement', key: 'paymentMethod', width: 18 },
      { header: 'Reference', key: 'reference', width: 20 },
      { header: 'Statut', key: 'status', width: 14 },
    ];
    depositSheet.getRow(1).font = { bold: true };
    for (const d of deposits) {
      depositSheet.addRow({
        date: d.date.toLocaleDateString('fr-FR'),
        amount: Number(d.amount),
        currency: d.currency,
        motif: d.motif ?? '',
        paymentMethod: d.paymentMethod,
        reference: d.reference ?? '',
        status: d.status,
      });
    }

    // --- Feuille Depenses ---
    const expenseSheet = workbook.addWorksheet('Depenses');
    expenseSheet.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Categorie', key: 'category', width: 22 },
      { header: 'Libelle', key: 'label', width: 30 },
      { header: 'Quantite', key: 'quantity', width: 12 },
      { header: 'Unite', key: 'unit', width: 10 },
      { header: 'Prix unitaire', key: 'unitPrice', width: 16 },
      { header: 'Total', key: 'total', width: 16 },
      { header: 'Fournisseur', key: 'supplier', width: 20 },
      { header: 'Statut paiement', key: 'paymentStatus', width: 16 },
    ];
    expenseSheet.getRow(1).font = { bold: true };
    for (const e of expenses) {
      expenseSheet.addRow({
        date: e.date.toLocaleDateString('fr-FR'),
        category: e.category?.name ?? '',
        label: e.label,
        quantity: Number(e.quantity),
        unit: e.unit,
        unitPrice: Number(e.unitPrice),
        total: Number(e.total),
        supplier: e.supplier ?? '',
        paymentStatus: e.paymentStatus,
      });
    }

    // --- Feuille Materiaux (agregation par materiau) ---
    const materialTotals = new Map<string, { quantity: number; total: number; unit: string }>();
    for (const e of expenses) {
      const key = e.label;
      const current = materialTotals.get(key) ?? { quantity: 0, total: 0, unit: e.unit };
      current.quantity += Number(e.quantity);
      current.total += Number(e.total);
      materialTotals.set(key, current);
    }
    const materialSheet = workbook.addWorksheet('Materiaux');
    materialSheet.columns = [
      { header: 'Materiau / element', key: 'label', width: 30 },
      { header: 'Quantite totale', key: 'quantity', width: 16 },
      { header: 'Unite', key: 'unit', width: 10 },
      { header: 'Montant total', key: 'total', width: 18 },
    ];
    materialSheet.getRow(1).font = { bold: true };
    for (const [label, data] of materialTotals.entries()) {
      materialSheet.addRow({ label, quantity: data.quantity, unit: data.unit, total: data.total });
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return { buffer, filename: `export-${project.name.replace(/\s+/g, '_')}-${Date.now()}.xlsx` };
  }
}
