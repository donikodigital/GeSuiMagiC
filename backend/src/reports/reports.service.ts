// backend/src/reports/reports.service.ts - v2.2
// Export Excel entierement repense pour se rapprocher du rapport PDF :
// - Recapitulatif enrichi (bandeau + logo, identite du chantier, KPI sous
//   forme de "cartes" avec FORMULES qui recalculent Total verse / Total
//   depense depuis la feuille Transactions elle-meme (regle 51 du cahier
//   des charges : le wallet est un cache, la verite est la somme des
//   operations APPROVED). Solde restant = formule Verse - Depense.
// - Nouvelle feuille "Repartition par categorie" (budget vs depense, %
//   consomme en formule IFERROR, code couleur par seuil, ligne TOTAL).
// - Nouvelle feuille "Transactions" : vue chronologique fusionnant depots
//   et depenses, a l'image du PDF.
// - Feuilles "Depots"/"Depenses" enrichies (superviseur, colonne "reste a
//   payer" en formule, ligne de total en formule SUM, entete colore,
//   filtre auto, volet fige).
// - Feuille "Materiaux" regroupee par (categorie + libelle) au lieu du
//   libelle seul (evite de fusionner par erreur deux materiaux de meme nom
//   dans des categories differentes), prix moyen calcule par formule.
// loadProjectData : ajout des relations supervisor/material necessaires a
// l'export Excel enrichi. N'affecte pas generatePdf, qui ignore ces champs.
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
  safetyLight: '#fdf1de',
  ink: '#1f2937',
  muted: '#6b7280',
  border: '#e2ded1',
  zebra: '#f7f5f0',
  neutralLight: '#eef1f6',
};

// ExcelJS attend un ARGB (8 caracteres, alpha en tete), pas un hex RGB classique.
const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;
const solidFill = (hex: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } });
const MONEY_FMT = '#,##0;(#,##0);"-"';

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
      this.prisma.deposit.findMany({
        where: { projectId, status: 'APPROVED' },
        include: { supervisor: true },
        orderBy: { date: 'asc' },
      }),
      this.prisma.expense.findMany({
        where: { projectId, status: 'APPROVED' },
        include: { category: true, material: true, supervisor: true },
        orderBy: { date: 'asc' },
      }),
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
  // PDF (section 38) - inchange
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
  // EXCEL (section 39) - v2.2, aligne sur le rapport PDF
  // --------------------------------------------------------------------
  async generateExcel(projectId: string): Promise<{ buffer: Buffer; filename: string }> {
    const { project, deposits, expenses, budgets, pendingDepositsCount, pendingExpensesCount } = await this.loadProjectData(projectId);
    const categoryRows = this.buildCategoryBreakdown(budgets, expenses);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Suivi de Chantier';
    workbook.created = new Date();

    const hasLogo = fs.existsSync(LOGO_PATH);
    const logoImageId = hasLogo ? workbook.addImage({ filename: LOGO_PATH, extension: 'png' }) : null;

    // ==================================================================
    // 1. RECAPITULATIF
    // ==================================================================
    const summary = workbook.addWorksheet('Recapitulatif', { properties: { tabColor: { argb: argb(COLOR.primary) } } });
    summary.columns = [{ width: 22 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }];

    summary.mergeCells('B1:F1');
    summary.mergeCells('B2:F2');
    summary.mergeCells('B3:F3');
    ['A1:F1', 'A2:F2', 'A3:F3'].forEach((range) => {
      summary.getCell(range.split(':')[0]);
    });
    for (let r = 1; r <= 3; r++) {
      for (let c = 1; c <= 6; c++) summary.getCell(r, c).fill = solidFill(COLOR.primary);
    }
    summary.getRow(1).height = 24;
    summary.getRow(2).height = 18;
    summary.getRow(3).height = 16;
    summary.getCell('B1').value = 'Suivi de Chantier';
    summary.getCell('B1').font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
    summary.getCell('B1').alignment = { vertical: 'middle' };
    summary.getCell('B2').value = 'RAPPORT FINANCIER DE CHANTIER';
    summary.getCell('B2').font = { bold: true, size: 9, color: { argb: argb(COLOR.gold) } };
    summary.getCell('B2').alignment = { vertical: 'middle' };
    summary.getCell('B3').value = `Genere le ${new Date().toLocaleString('fr-FR')}`;
    summary.getCell('B3').font = { size: 8, color: { argb: 'FFB8BCC8' } };
    summary.getCell('B3').alignment = { vertical: 'middle' };
    if (logoImageId !== null) {
      summary.addImage(logoImageId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 46, height: 46 } });
    }

    let r = 5;
    const identityField = (label: string, value: string) => {
      summary.getCell(`A${r}`).value = label;
      summary.getCell(`A${r}`).font = { bold: true, size: 8, color: { argb: argb(COLOR.muted) } };
      summary.mergeCells(`B${r}:F${r}`);
      summary.getCell(`B${r}`).value = value;
      summary.getCell(`B${r}`).font = { size: 11, color: { argb: argb(COLOR.ink) } };
      r += 1;
    };
    identityField('CLIENT', `${project.client.firstName} ${project.client.lastName}`);
    identityField('PROJET', project.name);
    identityField('LOCALISATION', [project.location, project.city, project.country].filter(Boolean).join(', ') || '-');
    identityField('STATUT', project.status);
    identityField('IDENTIFIANT DU PROJET', project.id);
    r += 1;

    const kpiHeaderRow = r;
    const kpiValueRow = r + 1;
    const kpis: Array<{ col: string; label: string; bg: string; color: string }> = [
      { col: 'A', label: `BUDGET (${project.currency})`, bg: COLOR.neutralLight, color: COLOR.primary },
      { col: 'B', label: `TOTAL VERSE (${project.currency})`, bg: COLOR.mossLight, color: COLOR.moss },
      { col: 'C', label: `TOTAL DEPENSE (${project.currency})`, bg: COLOR.clayLight, color: COLOR.clay },
      { col: 'D', label: `SOLDE RESTANT (${project.currency})`, bg: COLOR.neutralLight, color: COLOR.primary },
    ];
    for (const kpi of kpis) {
      summary.getCell(`${kpi.col}${kpiHeaderRow}`).fill = solidFill(kpi.bg);
      summary.getCell(`${kpi.col}${kpiValueRow}`).fill = solidFill(kpi.bg);
      const headCell = summary.getCell(`${kpi.col}${kpiHeaderRow}`);
      headCell.value = kpi.label;
      headCell.font = { bold: true, size: 7.5, color: { argb: argb(COLOR.muted) } };
      headCell.alignment = { wrapText: true, vertical: 'bottom' };
      const valCell = summary.getCell(`${kpi.col}${kpiValueRow}`);
      valCell.font = { bold: true, size: 13, color: { argb: argb(kpi.color) } };
      valCell.numFmt = MONEY_FMT;
    }
    summary.getCell(`A${kpiValueRow}`).value = Number(project.budget);

    if (pendingDepositsCount > 0 || pendingExpensesCount > 0) {
      const notes: string[] = [];
      if (pendingDepositsCount > 0) notes.push(`${pendingDepositsCount} depot(s) en attente de validation`);
      if (pendingExpensesCount > 0) notes.push(`${pendingExpensesCount} depense(s) en attente de validation`);
      const noteRow = kpiValueRow + 2;
      summary.mergeCells(`A${noteRow}:F${noteRow}`);
      const noteCell = summary.getCell(`A${noteRow}`);
      noteCell.value = `Ce classeur ne reprend que les operations validees. ${notes.join(' - ')} ne figurent pas ci-dessous.`;
      noteCell.font = { italic: true, size: 8.5, color: { argb: argb(COLOR.safety) } };
      noteCell.alignment = { wrapText: true };
    }

    // ==================================================================
    // 2. REPARTITION PAR CATEGORIE
    // ==================================================================
    const catSheet = workbook.addWorksheet('Repartition par categorie', { properties: { tabColor: { argb: argb(COLOR.gold) } } });
    catSheet.columns = [
      { header: 'Categorie', key: 'category', width: 28 },
      { header: `Budget (${project.currency})`, key: 'budget', width: 20 },
      { header: `Depense (${project.currency})`, key: 'spent', width: 20 },
      { header: `Restant (${project.currency})`, key: 'remaining', width: 20 },
      { header: '% consomme', key: 'pct', width: 14 },
    ];
    catSheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = solidFill(COLOR.primary);
    });
    catSheet.views = [{ state: 'frozen', ySplit: 1 }];
    catSheet.autoFilter = { from: 'A1', to: 'E1' };

    categoryRows.forEach((row, idx) => {
      const newRow = catSheet.addRow({ category: row.category, budget: row.budget, spent: row.spent });
      const rowNum = newRow.number;
      const budgetCell = catSheet.getCell(`B${rowNum}`);
      const spentCell = catSheet.getCell(`C${rowNum}`);
      const remainingCell = catSheet.getCell(`D${rowNum}`);
      const pctCell = catSheet.getCell(`E${rowNum}`);
      budgetCell.numFmt = MONEY_FMT;
      spentCell.numFmt = MONEY_FMT;
      remainingCell.value = { formula: `B${rowNum}-C${rowNum}` } as any;
      remainingCell.numFmt = MONEY_FMT;
      pctCell.value = { formula: `IF(B${rowNum}=0,0,C${rowNum}/B${rowNum})` } as any;
      pctCell.numFmt = '0%';
      const pct = row.budget > 0 ? row.spent / row.budget : row.spent > 0 ? 1 : 0;
      const bg = pct > 1 ? COLOR.clayLight : pct > 0.8 ? COLOR.safetyLight : COLOR.mossLight;
      const fg = pct > 1 ? COLOR.clay : pct > 0.8 ? COLOR.safety : COLOR.moss;
      pctCell.fill = solidFill(bg);
      pctCell.font = { bold: true, color: { argb: argb(fg) } };
      if (idx % 2 === 0) {
        ['A', 'B', 'C', 'D'].forEach((col) => {
          catSheet.getCell(`${col}${rowNum}`).fill = solidFill(COLOR.zebra);
        });
      }
    });

    if (categoryRows.length > 0) {
      const totalRow = categoryRows.length + 2;
      catSheet.getCell(`A${totalRow}`).value = 'TOTAL';
      catSheet.getCell(`A${totalRow}`).font = { bold: true };
      catSheet.getCell(`B${totalRow}`).value = { formula: `SUM(B2:B${totalRow - 1})` } as any;
      catSheet.getCell(`C${totalRow}`).value = { formula: `SUM(C2:C${totalRow - 1})` } as any;
      catSheet.getCell(`D${totalRow}`).value = { formula: `B${totalRow}-C${totalRow}` } as any;
      catSheet.getCell(`E${totalRow}`).value = { formula: `IF(B${totalRow}=0,0,C${totalRow}/B${totalRow})` } as any;
      ['B', 'C', 'D'].forEach((col) => (catSheet.getCell(`${col}${totalRow}`).numFmt = MONEY_FMT));
      catSheet.getCell(`E${totalRow}`).numFmt = '0%';
      catSheet.getRow(totalRow).font = { bold: true };
      catSheet.getRow(totalRow).eachCell((cell) => {
        cell.border = { top: { style: 'medium', color: { argb: argb(COLOR.primary) } } };
      });
    }

    // ==================================================================
    // 3. TRANSACTIONS (vue chronologique, a l'image du PDF)
    // ==================================================================
    const txSheet = workbook.addWorksheet('Transactions', { properties: { tabColor: { argb: argb(COLOR.ink) } } });
    txSheet.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Type', key: 'type', width: 12 },
      { header: 'Categorie', key: 'category', width: 20 },
      { header: 'Libelle', key: 'label', width: 32 },
      { header: 'Quantite', key: 'quantity', width: 10 },
      { header: 'Unite', key: 'unit', width: 8 },
      { header: `P.U. (${project.currency})`, key: 'unitPrice', width: 16 },
      { header: `Total (${project.currency})`, key: 'total', width: 16 },
      { header: 'Superviseur', key: 'supervisor', width: 20 },
      { header: 'Observation', key: 'observation', width: 40 },
    ];
    txSheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = solidFill(COLOR.primary);
    });
    txSheet.views = [{ state: 'frozen', ySplit: 1 }];
    txSheet.autoFilter = { from: 'A1', to: 'J1' };

    const txRows = [
      ...deposits.map((d) => ({
        date: d.date,
        type: 'Depot' as const,
        category: '-',
        label: d.motif || 'Depot de fonds',
        quantity: null as number | null,
        unit: '-',
        unitPrice: null as number | null,
        total: Number(d.amount),
        supervisor: `${d.supervisor?.firstName ?? ''} ${d.supervisor?.lastName ?? ''}`.trim() || '-',
        observation: d.observation || '',
      })),
      ...expenses.map((e) => ({
        date: e.date,
        type: 'Depense' as const,
        category: e.category?.name ?? '',
        label: e.label,
        quantity: Number(e.quantity),
        unit: e.unit,
        unitPrice: Number(e.unitPrice),
        total: -Number(e.total),
        supervisor: `${e.supervisor?.firstName ?? ''} ${e.supervisor?.lastName ?? ''}`.trim() || '-',
        observation: e.observation || '',
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    txRows.forEach((row, idx) => {
      const newRow = txSheet.addRow({
        date: row.date.toLocaleDateString('fr-FR'),
        type: row.type,
        category: row.category,
        label: row.label,
        quantity: row.quantity,
        unit: row.unit,
        unitPrice: row.unitPrice,
        total: row.total,
        supervisor: row.supervisor,
        observation: row.observation,
      });
      const rowNum = newRow.number;
      txSheet.getCell(`B${rowNum}`).font = { bold: true, color: { argb: argb(row.type === 'Depot' ? COLOR.moss : COLOR.clay) } };
      txSheet.getCell(`G${rowNum}`).numFmt = MONEY_FMT;
      const totalCell = txSheet.getCell(`H${rowNum}`);
      totalCell.numFmt = MONEY_FMT;
      totalCell.font = { bold: true, color: { argb: argb(row.total >= 0 ? COLOR.moss : COLOR.ink) } };
      if (idx % 2 === 0) {
        for (let c = 1; c <= 10; c++) {
          txSheet.getCell(rowNum, c).fill = solidFill(COLOR.zebra);
        }
      }
    });

    // Renseigne les KPI du Recapitulatif maintenant que Transactions existe.
    const lastTxRow = txRows.length + 1;
    if (txRows.length > 0) {
      summary.getCell(`B${kpiValueRow}`).value = {
        formula: `SUMIF(Transactions!B2:B${lastTxRow},"Depot",Transactions!H2:H${lastTxRow})`,
      } as any;
      summary.getCell(`C${kpiValueRow}`).value = {
        formula: `-SUMIF(Transactions!B2:B${lastTxRow},"Depense",Transactions!H2:H${lastTxRow})`,
      } as any;
    } else {
      summary.getCell(`B${kpiValueRow}`).value = 0;
      summary.getCell(`C${kpiValueRow}`).value = 0;
    }
    summary.getCell(`D${kpiValueRow}`).value = { formula: `B${kpiValueRow}-C${kpiValueRow}` } as any;

    // ==================================================================
    // 4. DEPOTS
    // ==================================================================
    const depositSheet = workbook.addWorksheet('Depots', { properties: { tabColor: { argb: argb(COLOR.moss) } } });
    depositSheet.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Montant', key: 'amount', width: 16 },
      { header: 'Devise', key: 'currency', width: 10 },
      { header: 'Motif', key: 'motif', width: 30 },
      { header: 'Mode de versement', key: 'paymentMethod', width: 18 },
      { header: 'Reference', key: 'reference', width: 20 },
      { header: 'Superviseur', key: 'supervisor', width: 22 },
      { header: 'Statut', key: 'status', width: 14 },
      { header: 'Observation', key: 'observation', width: 36 },
    ];
    depositSheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = solidFill(COLOR.moss);
    });
    depositSheet.views = [{ state: 'frozen', ySplit: 1 }];
    depositSheet.autoFilter = { from: 'A1', to: 'I1' };

    for (const d of deposits) {
      const newRow = depositSheet.addRow({
        date: d.date.toLocaleDateString('fr-FR'),
        amount: Number(d.amount),
        currency: d.currency,
        motif: d.motif ?? '',
        paymentMethod: d.paymentMethod,
        reference: d.reference ?? '',
        supervisor: `${d.supervisor?.firstName ?? ''} ${d.supervisor?.lastName ?? ''}`.trim() || '-',
        status: d.status,
        observation: d.observation ?? '',
      });
      depositSheet.getCell(`B${newRow.number}`).numFmt = MONEY_FMT;
    }
    if (deposits.length > 0) {
      const totalRow = deposits.length + 2;
      depositSheet.getCell(`A${totalRow}`).value = 'TOTAL';
      depositSheet.getCell(`A${totalRow}`).font = { bold: true };
      depositSheet.getCell(`B${totalRow}`).value = { formula: `SUM(B2:B${totalRow - 1})` } as any;
      depositSheet.getCell(`B${totalRow}`).numFmt = MONEY_FMT;
      depositSheet.getRow(totalRow).font = { bold: true };
    }

    // ==================================================================
    // 5. DEPENSES
    // ==================================================================
    const expenseSheet = workbook.addWorksheet('Depenses', { properties: { tabColor: { argb: argb(COLOR.clay) } } });
    expenseSheet.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Categorie', key: 'category', width: 22 },
      { header: 'Materiau', key: 'material', width: 20 },
      { header: 'Libelle', key: 'label', width: 30 },
      { header: 'Quantite', key: 'quantity', width: 12 },
      { header: 'Unite', key: 'unit', width: 10 },
      { header: 'Prix unitaire', key: 'unitPrice', width: 16 },
      { header: 'Total', key: 'total', width: 16 },
      { header: 'Fournisseur', key: 'supplier', width: 20 },
      { header: 'Superviseur', key: 'supervisor', width: 22 },
      { header: 'Statut paiement', key: 'paymentStatus', width: 16 },
      { header: 'Reste a payer', key: 'balanceDue', width: 16 },
      { header: 'Reference facture', key: 'invoiceReference', width: 18 },
      { header: 'Observation', key: 'observation', width: 36 },
    ];
    expenseSheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = solidFill(COLOR.clay);
    });
    expenseSheet.views = [{ state: 'frozen', ySplit: 1 }];
    expenseSheet.autoFilter = { from: 'A1', to: 'N1' };

    for (const e of expenses) {
      const newRow = expenseSheet.addRow({
        date: e.date.toLocaleDateString('fr-FR'),
        category: e.category?.name ?? '',
        material: e.material?.name ?? '',
        label: e.label,
        quantity: Number(e.quantity),
        unit: e.unit,
        unitPrice: Number(e.unitPrice),
        total: Number(e.total),
        supplier: e.supplier ?? '',
        supervisor: `${e.supervisor?.firstName ?? ''} ${e.supervisor?.lastName ?? ''}`.trim() || '-',
        paymentStatus: e.paymentStatus,
        balanceDue: null,
        invoiceReference: e.invoiceReference ?? '',
        observation: e.observation ?? '',
      });
      const rowNum = newRow.number;
      expenseSheet.getCell(`G${rowNum}`).numFmt = MONEY_FMT;
      expenseSheet.getCell(`H${rowNum}`).numFmt = MONEY_FMT;
      // Reste a payer au fournisseur = total - deja verse (formule ; ce
      // champ n'affecte jamais le solde du chantier, cf. commentaire Prisma
      // sur ExpensePaymentStatus).
      expenseSheet.getCell(`L${rowNum}`).value = { formula: `H${rowNum}-${Number(e.amountPaidToSupplier)}` } as any;
      expenseSheet.getCell(`L${rowNum}`).numFmt = MONEY_FMT;
    }
    if (expenses.length > 0) {
      const totalRow = expenses.length + 2;
      expenseSheet.getCell(`A${totalRow}`).value = 'TOTAL';
      expenseSheet.getCell(`A${totalRow}`).font = { bold: true };
      expenseSheet.getCell(`H${totalRow}`).value = { formula: `SUM(H2:H${totalRow - 1})` } as any;
      expenseSheet.getCell(`H${totalRow}`).numFmt = MONEY_FMT;
      expenseSheet.getRow(totalRow).font = { bold: true };
    }

    // ==================================================================
    // 6. MATERIAUX (regroupe par categorie + libelle)
    // ==================================================================
    const materialTotals = new Map<string, { category: string; label: string; quantity: number; total: number; unit: string; count: number }>();
    for (const e of expenses) {
      const key = `${e.categoryId}::${e.label}`;
      const current = materialTotals.get(key) ?? { category: e.category?.name ?? '', label: e.label, quantity: 0, total: 0, unit: e.unit, count: 0 };
      current.quantity += Number(e.quantity);
      current.total += Number(e.total);
      current.count += 1;
      materialTotals.set(key, current);
    }
    const materialSheet = workbook.addWorksheet('Materiaux', { properties: { tabColor: { argb: argb(COLOR.muted) } } });
    materialSheet.columns = [
      { header: 'Categorie', key: 'category', width: 22 },
      { header: 'Materiau / element', key: 'label', width: 30 },
      { header: 'Quantite totale', key: 'quantity', width: 16 },
      { header: 'Unite', key: 'unit', width: 10 },
      { header: "Nombre d'achats", key: 'count', width: 14 },
      { header: 'Montant total', key: 'total', width: 18 },
      { header: 'Prix moyen', key: 'avgPrice', width: 16 },
    ];
    materialSheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = solidFill(COLOR.muted);
    });
    materialSheet.views = [{ state: 'frozen', ySplit: 1 }];
    materialSheet.autoFilter = { from: 'A1', to: 'G1' };

    for (const data of [...materialTotals.values()].sort((a, b) => b.total - a.total)) {
      const newRow = materialSheet.addRow({
        category: data.category,
        label: data.label,
        quantity: data.quantity,
        unit: data.unit,
        count: data.count,
        total: data.total,
        avgPrice: null,
      });
      const rowNum = newRow.number;
      materialSheet.getCell(`F${rowNum}`).numFmt = MONEY_FMT;
      materialSheet.getCell(`G${rowNum}`).value = { formula: `IF(C${rowNum}=0,0,F${rowNum}/C${rowNum})` } as any;
      materialSheet.getCell(`G${rowNum}`).numFmt = MONEY_FMT;
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return { buffer, filename: `export-${project.name.replace(/\s+/g, '_')}-${Date.now()}.xlsx` };
  }
}