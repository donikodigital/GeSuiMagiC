//backend/src/common/pdf/pdf.util.ts
import PDFDocument from 'pdfkit';

/** Palette des documents PDF (alignee sur le rapport financier). */
export const PDF_COLOR = {
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

export const PDF_MARGIN = 40;

export type PdfDoc = InstanceType<typeof PDFDocument>;

/** Construit un PDF A4 en memoire. Les pages sont numerotees « Page x / y » apres coup. */
export function renderPdf(build: (doc: PdfDoc) => void | Promise<void>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PDF_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    Promise.resolve(build(doc))
      .then(() => {
        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i += 1) {
          doc.switchToPage(range.start + i);
          doc.font('Helvetica').fontSize(8).fillColor(PDF_COLOR.muted);
          doc.text(`Page ${i + 1} / ${range.count}`, PDF_MARGIN, doc.page.height - 30, { width: doc.page.width - PDF_MARGIN * 2, align: 'right', lineBreak: false });
        }
        doc.end();
      })
      .catch(reject);
  });
}

export function pdfWidth(doc: PdfDoc): number {
  return doc.page.width - PDF_MARGIN * 2;
}

/** Bandeau de titre en haut de la premiere page. */
export function pdfHeader(doc: PdfDoc, kicker: string, title: string, subtitle?: string): void {
  doc.rect(0, 0, doc.page.width, 84).fill(PDF_COLOR.primary);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(17).text('Suivi de Chantier', PDF_MARGIN, 20);
  doc.fillColor(PDF_COLOR.gold).font('Helvetica-Bold').fontSize(9).text(kicker.toUpperCase(), PDF_MARGIN, 42, { characterSpacing: 1 });
  doc.fillColor('#ffffff').font('Helvetica').fontSize(11).text(title, PDF_MARGIN, 58, { width: pdfWidth(doc) });
  doc.y = 100;
  if (subtitle) {
    doc.font('Helvetica').fontSize(9).fillColor(PDF_COLOR.muted).text(subtitle, PDF_MARGIN, doc.y, { width: pdfWidth(doc) });
    doc.moveDown(0.6);
  }
}

/** Passe a la page suivante s'il ne reste pas `height` points. */
export function pdfEnsureSpace(doc: PdfDoc, height: number): void {
  if (doc.y + height > doc.page.height - 50) doc.addPage();
}

export function pdfSection(doc: PdfDoc, title: string): void {
  pdfEnsureSpace(doc, 50);
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(PDF_COLOR.primary).text(title, PDF_MARGIN, doc.y, { width: pdfWidth(doc) });
  const y = doc.y + 2;
  doc.moveTo(PDF_MARGIN, y).lineTo(PDF_MARGIN + pdfWidth(doc), y).lineWidth(0.8).strokeColor(PDF_COLOR.gold).stroke();
  doc.y = y + 8;
}

export function pdfParagraph(doc: PdfDoc, text: string, options: { muted?: boolean; size?: number } = {}): void {
  doc.font('Helvetica').fontSize(options.size ?? 10).fillColor(options.muted ? PDF_COLOR.muted : PDF_COLOR.ink);
  doc.text(text, PDF_MARGIN, doc.y, { width: pdfWidth(doc) });
  doc.moveDown(0.4);
}

/** Liste « etiquette : valeur » sur deux colonnes. */
export function pdfKeyValues(doc: PdfDoc, pairs: Array<[string, string]>): void {
  const colWidth = pdfWidth(doc) / 2;
  for (let i = 0; i < pairs.length; i += 2) {
    pdfEnsureSpace(doc, 34);
    const y = doc.y;
    let bottom = y;
    pairs.slice(i, i + 2).forEach(([label, value], index) => {
      const x = PDF_MARGIN + index * colWidth;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(PDF_COLOR.muted).text(label.toUpperCase(), x, y, { width: colWidth - 10, characterSpacing: 0.4 });
      doc.font('Helvetica').fontSize(10.5).fillColor(PDF_COLOR.ink).text(value || '-', x, y + 10, { width: colWidth - 10 });
      bottom = Math.max(bottom, doc.y);
    });
    doc.y = bottom + 6;
  }
}

export function pdfBullets(doc: PdfDoc, items: string[]): void {
  for (const item of items) {
    pdfEnsureSpace(doc, 16);
    doc.font('Helvetica').fontSize(10).fillColor(PDF_COLOR.ink).text(`•  ${item}`, PDF_MARGIN + 6, doc.y, { width: pdfWidth(doc) - 6 });
    doc.moveDown(0.15);
  }
}

/** Cartes de chiffres cles (jusqu'a 4 par ligne). */
export function pdfStatCards(doc: PdfDoc, cards: Array<{ label: string; value: string; tone?: 'neutral' | 'good' | 'bad' | 'warn' }>): void {
  const perRow = Math.min(4, cards.length);
  const gap = 10;
  const width = (pdfWidth(doc) - gap * (perRow - 1)) / perRow;
  const height = 50;
  const tones = {
    neutral: { bg: PDF_COLOR.neutralLight, fg: PDF_COLOR.primary },
    good: { bg: PDF_COLOR.mossLight, fg: PDF_COLOR.moss },
    bad: { bg: PDF_COLOR.clayLight, fg: PDF_COLOR.clay },
    warn: { bg: PDF_COLOR.safetyLight, fg: PDF_COLOR.safety },
  };
  for (let i = 0; i < cards.length; i += perRow) {
    pdfEnsureSpace(doc, height + 10);
    const y = doc.y;
    cards.slice(i, i + perRow).forEach((card, index) => {
      const tone = tones[card.tone ?? 'neutral'];
      const x = PDF_MARGIN + index * (width + gap);
      doc.roundedRect(x, y, width, height, 6).fill(tone.bg);
      doc.font('Helvetica-Bold').fontSize(7).fillColor(PDF_COLOR.muted).text(card.label.toUpperCase(), x + 8, y + 8, { width: width - 16, characterSpacing: 0.4 });
      doc.font('Helvetica-Bold').fontSize(11).fillColor(tone.fg).text(card.value, x + 8, y + 24, { width: width - 16 });
    });
    doc.y = y + height + 10;
  }
}

/** Ligne horizontale de progression (0-100) avec libelle a gauche et valeur a droite. */
export function pdfProgressRow(doc: PdfDoc, label: string, percent: number, right?: string): void {
  pdfEnsureSpace(doc, 24);
  const y = doc.y;
  const labelWidth = 150;
  const barX = PDF_MARGIN + labelWidth;
  const barWidth = pdfWidth(doc) - labelWidth - 90;
  doc.font('Helvetica').fontSize(9.5).fillColor(PDF_COLOR.ink).text(label, PDF_MARGIN, y, { width: labelWidth - 8, lineBreak: false, ellipsis: true });
  doc.roundedRect(barX, y + 2, barWidth, 8, 4).fill(PDF_COLOR.neutralLight);
  const clamped = Math.min(100, Math.max(0, percent));
  if (clamped > 0) doc.roundedRect(barX, y + 2, (barWidth * clamped) / 100, 8, 4).fill(clamped >= 100 ? PDF_COLOR.moss : PDF_COLOR.gold);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(PDF_COLOR.ink).text(right ?? `${clamped} %`, barX + barWidth + 8, y, { width: 82, align: 'left', lineBreak: false });
  doc.y = y + 18;
}

/** Date au format JJ/MM/AAAA (colonne SQL DATE ou ISO). */
export function frDate(value: Date | string | null | undefined): string {
  if (!value) return '-';
  const iso = typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « octobre 2026 » pour « 2026-10 ». */
export function frMonthLabel(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  return `${MONTHS_FR[mon - 1]} ${year}`;
}
