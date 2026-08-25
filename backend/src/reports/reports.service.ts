// ============================================================================
// backend/src/reports/reports.service.ts - v2.1
// Ajout du logo GeSuiMagiC dans le bandeau d'en-tete du PDF (a gauche du
// titre "Suivi de Chantier"), coins arrondis via un clip PDFKit pour rester
// coherent avec le traitement du logo cote frontend (rounded-2xl).
// Lecture du fichier verifiee avec fs.existsSync : si le PNG n'est pas
// present sur le serveur (asset pas copie au build, mauvais chemin...), le
// rapport se genere quand meme sans logo plutot que de planter.
// ============================================================================

import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
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
  totalRaw: number;
  observation: string;
}

const COLOR = {
  primary: '#0B1330',
  gold: '#C9A24A',
  moss: '#4a7c59',
  mossLight: '#eaf3ec',
  clay: '#b5533c',
  clayLight: '#f6ece7',
  safety: '#c07f1f',
  ink: '#1f2937',
  muted: '#6b7280',
  border: '#e2ded1',
  zebra: '#f7f5f0',
  neutralLight: '#eef1f6',
};

// Chemin resolu depuis la racine du process (cwd du serveur Nest en prod),
// pas depuis __dirname qui pointe vers dist/reports une fois compile.
const LOGO_PATH = path.join(process.cwd(), 'assets', 'logo.png');

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadProjectData(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { client: true, wallet: true },
    });
    if (!project) throw AppException.notFound('Projet');

    const [deposits, expenses, budgets, pendingDepositsCount, pendingExpensesCount] = await Promise.all([
      this.prisma.deposit.findMany({ where: { projectId, status: 'APPROVED' }, orderBy: { date: 'asc' } }),
      this.prisma.expense.findMany({ where: { projectId, status: 'APPROVED' }, include: { category: true }, orderBy: { date: 'asc' } }),
      this.prisma.budget.findMany({ where: { projectId }, include: { category: true } }),
      this.prisma.deposit.count({ where: { projectId, status: 'PENDING' } }),
      this.prisma.expense.count({ where: { projectId, status: { in: ['PENDING', 'DRAFT'] } } }),
    ]);

    return { project, deposits, expenses, budgets, pendingDepositsCount, pendingExpensesCount };
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
        totalRaw: Number(d.amount),
        observation: d.observation || '',
      })),
      ...expenses.map((e) => ({
        date: e.date,
        type: 'Depense' as const,
        label: `${e.category?.name ?? ''} - ${e.label}`,
        quantity: String(e.quantity),
        unitPrice: formatMoney(e.unitPrice, ''),
        total: `-${formatMoney(e.total, '')}`,
        totalRaw: -Number(e.total),
        observation: e.observation || '',
      })),
    ];
    return rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private buildCategoryBreakdown(budgets: any[], expenses: any[]) {
    const spentByCategory = new Map<string, number>();
    for (const e of expenses) {
      spentByCategory.set(e.categoryId, (spentByCategory.get(e.categoryId) ?? 0) + Number(e.total));
    }

    const rows = budgets.map((b) => ({
      category: b.category?.name ?? 'Categorie',
      budget: Number(b.amount),
      spent: spentByCategory.get(b.categoryId) ?? 0,
    }));

    const budgetedIds = new Set(budgets.map((b) => b.categoryId));
    const seenExtra = new Set<string>();
    for (const e of expenses) {
      if (!budgetedIds.has(e.categoryId) && !seenExtra.has(e.categoryId)) {
        rows.push({ category: e.category?.name ?? 'Hors categorie', budget: 0, spent: spentByCategory.get(e.categoryId) ?? 0 });
        seenExtra.add(e.categoryId);
      }
    }

    return rows.sort((a, b) => b.spent - a.spent);
  }

  // --------------------------------------------------------------------
  // PDF (section 38)
  // --------------------------------------------------------------------
  async generatePdf(projectId: string): Promise<{ buffer: Buffer; filename: string }> {
    const { project, deposits, expenses, budgets, pendingDepositsCount, pendingExpensesCount } = await this.loadProjectData(projectId);
    const rows = this.buildRows(deposits, expenses);
    const categoryRows = this.buildCategoryBreakdown(budgets, expenses);

    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    const marginX = 40;
    const pageWidth = doc.page.width - marginX * 2;
    const balance = Number(project.wallet?.balance ?? 0);

    // ------------------------------------------------------------------
    // Bandeau d'en-tete
    // ------------------------------------------------------------------
    doc.rect(0, 0, doc.page.width, 84).fill(COLOR.primary);

    const logoSize = 56;
    const logoX = marginX;
    const logoY = 14;
    let textX = marginX;

    const hasLogo = fs.existsSync(LOGO_PATH);
    if (hasLogo) {
      doc.save();
      doc.roundedRect(logoX, logoY, logoSize, logoSize, 8).clip();
      doc.image(LOGO_PATH, logoX, logoY, { width: logoSize, height: logoSize });
      doc.restore();
      textX = logoX + logoSize + 12;
    }

    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(17).text('Suivi de Chantier', textX, 22);
    doc.fillColor(COLOR.gold).font('Helvetica-Bold').fontSize(9).text('RAPPORT FINANCIER DE CHANTIER', textX, 44, { characterSpacing: 1 });
    doc.fillColor('#ffffff').fillOpacity(0.55).font('Helvetica').fontSize(8);
    doc.text(`Genere le ${new Date().toLocaleString('fr-FR')}`, textX, 60);
    doc.fillOpacity(1);

    // ------------------------------------------------------------------
    // Identite du chantier (2 colonnes)
    // ------------------------------------------------------------------
    let y = 104;
    const col2X = marginX + pageWidth / 2;

    const metaField = (label: string, value: string, x: number, atY: number) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR.muted).text(label, x, atY, { characterSpacing: 0.5 });
      doc.font('Helvetica').fontSize(11).fillColor(COLOR.ink).text(value, x, atY + 11);
    };

    metaField('CLIENT', `${project.client.firstName} ${project.client.lastName}`, marginX, y);
    metaField('PROJET', project.name, col2X, y);
    y += 36;
    metaField('LOCALISATION', [project.location, project.city, project.country].filter(Boolean).join(', ') || '-', marginX, y);
    metaField('STATUT', project.status, col2X, y);
    y += 32;

    doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.muted).text(`Identifiant du projet : ${project.id}`, marginX, y);
    y += 18;

    // ------------------------------------------------------------------
    // Resume executif (4 cartes)
    // ------------------------------------------------------------------
    const cardGap = 10;
    const cardWidth = (pageWidth - cardGap * 3) / 4;
    const cardHeight = 52;
    const balanceLight = balance < 0 ? COLOR.clayLight : COLOR.mossLight;
    const balanceColor = balance < 0 ? COLOR.clay : COLOR.moss;

    const cards = [
      { label: 'BUDGET', value: formatMoney(project.budget, project.currency), bg: COLOR.neutralLight, color: COLOR.primary },
      { label: 'TOTAL VERSE', value: formatMoney(project.wallet?.totalDeposited ?? 0, project.currency), bg: COLOR.mossLight, color: COLOR.moss },
      { label: 'TOTAL DEPENSE', value: formatMoney(project.wallet?.totalSpent ?? 0, project.currency), bg: COLOR.clayLight, color: COLOR.clay },
      { label: 'SOLDE RESTANT', value: formatMoney(balance, project.currency), bg: balanceLight, color: balanceColor },
    ];

    cards.forEach((card, i) => {
      const x = marginX + i * (cardWidth + cardGap);
      doc.roundedRect(x, y, cardWidth, cardHeight, 6).fill(card.bg);
      doc.font('Helvetica-Bold').fontSize(7).fillColor(COLOR.muted).text(card.label, x + 8, y + 8, { width: cardWidth - 16 });
      doc.font('Helvetica-Bold').fontSize(11).fillColor(card.color).text(card.value, x + 8, y + 24, { width: cardWidth - 16 });
    });
    y += cardHeight + 10;

    if (pendingDepositsCount > 0 || pendingExpensesCount > 0) {
      const notes: string[] = [];
      if (pendingDepositsCount > 0) notes.push(`${pendingDepositsCount} depot(s) en attente de validation`);
      if (pendingExpensesCount > 0) notes.push(`${pendingExpensesCount} depense(s) en attente de validation`);
      doc.font('Helvetica-Oblique').fontSize(8).fillColor(COLOR.safety);
      doc.text(`Ce rapport ne reprend que les operations validees. ${notes.join(' - ')} ne figurent pas ci-dessous.`, marginX, y, {
        width: pageWidth,
      });
      y = doc.y + 10;
    }

    doc.y = y;

    // ------------------------------------------------------------------
    // Repartition par categorie
    // ------------------------------------------------------------------
    if (categoryRows.length > 0) {
      if (doc.y > doc.page.height - 160) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.ink).text('Repartition par categorie', marginX, doc.y);
      doc.moveDown(0.5);

      const catCols = [
        { label: 'Categorie', width: pageWidth * 0.36 },
        { label: 'Budget', width: pageWidth * 0.22 },
        { label: 'Depense', width: pageWidth * 0.22 },
        { label: '% consomme', width: pageWidth * 0.2 },
      ];

      const drawCatHeader = () => {
        const hy = doc.y;
        doc.rect(marginX, hy, pageWidth, 18).fill(COLOR.primary);
        let cx = marginX + 6;
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
        for (const c of catCols) {
          doc.text(c.label, cx, hy + 5, { width: c.width - 6 });
          cx += c.width;
        }
        doc.y = hy + 18;
      };

      drawCatHeader();

      categoryRows.forEach((row, idx) => {
        if (doc.y > doc.page.height - 80) {
          doc.addPage();
          doc.y = 40;
          drawCatHeader();
        }
        const ry = doc.y;
        const rowH = 18;
        if (idx % 2 === 0) doc.rect(marginX, ry, pageWidth, rowH).fill(COLOR.zebra);

        const pct = row.budget > 0 ? Math.round((row.spent / row.budget) * 100) : row.spent > 0 ? 100 : 0;
        const pctColor = pct > 100 ? COLOR.clay : pct > 80 ? COLOR.safety : COLOR.moss;

        let cx = marginX + 6;
        doc.font('Helvetica').fontSize(8.5).fillColor(COLOR.ink);
        doc.text(row.category, cx, ry + 4, { width: catCols[0].width - 6, ellipsis: true });
        cx += catCols[0].width;
        doc.text(row.budget > 0 ? formatMoney(row.budget, project.currency) : '-', cx, ry + 4, { width: catCols[1].width - 6 });
        cx += catCols[1].width;
        doc.text(formatMoney(row.spent, project.currency), cx, ry + 4, { width: catCols[2].width - 6 });
        cx += catCols[2].width;
        doc.fillColor(pctColor).font('Helvetica-Bold').text(row.budget > 0 ? `${pct}%` : '-', cx, ry + 4, { width: catCols[3].width - 6 });

        doc.y = ry + rowH;
      });
      doc.moveDown(1);
    }

    // ------------------------------------------------------------------
    // Detail des transactions
    // ------------------------------------------------------------------
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.ink).text('Detail des transactions', marginX, doc.y);
    doc.moveDown(0.5);

    const columns = [
      { key: 'date', label: 'Date', width: 55 },
      { key: 'type', label: 'Type', width: 52 },
      { key: 'label', label: 'Libelle', width: 130 },
      { key: 'quantity', label: 'Qte', width: 35 },
      { key: 'unitPrice', label: 'P.U.', width: 62 },
      { key: 'total', label: 'Total', width: 78 },
      { key: 'observation', label: 'Observation', width: pageWidth - (55 + 52 + 130 + 35 + 62 + 78) },
    ];

    const drawHeader = () => {
      const hy = doc.y;
      doc.rect(marginX, hy, pageWidth, 18).fill(COLOR.primary);
      let cx = marginX + 5;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
      for (const col of columns) {
        doc.text(col.label, cx, hy + 5, { width: col.width - 6, ellipsis: true });
        cx += col.width;
      }
      doc.y = hy + 18;
    };

    drawHeader();

    if (rows.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLOR.muted).text('Aucune operation validee pour ce chantier.', marginX + 6, doc.y + 8);
      doc.moveDown(2);
    }

    rows.forEach((row, idx) => {
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
        doc.y = 40;
        drawHeader();
      }
      const ry = doc.y;
      const rowH = 17;
      if (idx % 2 === 0) doc.rect(marginX, ry, pageWidth, rowH).fill(COLOR.zebra);

      let cx = marginX + 5;
      doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.ink);
      doc.text(row.date.toLocaleDateString('fr-FR'), cx, ry + 4, { width: columns[0].width - 6 });
      cx += columns[0].width;

      doc.font('Helvetica-Bold').fillColor(row.type === 'Depot' ? COLOR.moss : COLOR.clay);
      doc.text(row.type === 'Depot' ? 'Depot' : 'Depense', cx, ry + 4, { width: columns[1].width - 6 });
      cx += columns[1].width;

      doc.font('Helvetica').fillColor(COLOR.ink);
      doc.text(row.label, cx, ry + 4, { width: columns[2].width - 6, ellipsis: true });
      cx += columns[2].width;
      doc.text(row.quantity, cx, ry + 4, { width: columns[3].width - 6 });
      cx += columns[3].width;
      doc.text(row.unitPrice, cx, ry + 4, { width: columns[4].width - 6, ellipsis: true });
      cx += columns[4].width;

      doc.font('Helvetica-Bold').fillColor(row.totalRaw >= 0 ? COLOR.moss : COLOR.ink);
      doc.text(row.total, cx, ry + 4, { width: columns[5].width - 6, ellipsis: true });
      cx += columns[5].width;

      doc.font('Helvetica').fillColor(COLOR.muted).fontSize(7);
      doc.text(row.observation, cx, ry + 4, { width: columns[6].width - 6, ellipsis: true });

      doc.y = ry + rowH;
    });

    doc.moveDown(1);
    doc.font('Helvetica').fontSize(8).fillColor(COLOR.muted);
    doc.text(`Nombre de transactions : ${rows.length}`, marginX, doc.y);
    if (rows.length > 0) {
      doc.text(
        `Periode couverte : ${rows[0].date.toLocaleDateString('fr-FR')} - ${rows[rows.length - 1].date.toLocaleDateString('fr-FR')}`,
        marginX,
        doc.y,
      );
    }

    // ------------------------------------------------------------------
    // Pied de page (pagination) - applique a toutes les pages generees
    // ------------------------------------------------------------------
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const footerY = doc.page.height - 34;
      doc.moveTo(marginX, footerY).lineTo(doc.page.width - marginX, footerY).lineWidth(0.5).strokeColor(COLOR.gold).stroke();
      doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.muted);
      doc.text('Suivi de Chantier - document genere automatiquement', marginX, footerY + 6);
      doc.text(`Page ${i - range.start + 1} / ${range.count}`, marginX, footerY + 6, { width: pageWidth, align: 'right' });
    }

    doc.end();

    const buffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    return { buffer, filename: `rapport-${project.name.replace(/\s+/g, '_')}-${Date.now()}.pdf` };
  }

  // --------------------------------------------------------------------
  // EXCEL (section 39) - inchange
  // --------------------------------------------------------------------
  async generateExcel(projectId: string): Promise<{ buffer: Buffer; filename: string }> {
    const { project, deposits, expenses } = await this.loadProjectData(projectId);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Suivi de Chantier';
    workbook.created = new Date();

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