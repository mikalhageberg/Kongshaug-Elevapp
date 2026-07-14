import PDFDocument from 'pdfkit';
import { nightLabel, formatCheckedAt } from './fireReport.js';

const STATUS = { present: 'Til stede', away: 'Borte', missing: 'MANGLER' };

// Bygg en ren, lettlest brannliste-PDF. Returnerer en Buffer.
export function buildFireListPdf(overview) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 40, right = 555;
    const cols = { name: 40, room: 300, status: 365, time: 470 };
    const bottom = () => doc.page.height - 50;

    // Tittel + info
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#000')
      .text(`Brannliste — natt til ${nightLabel(overview.nightDate)}`, left, 42);
    doc.font('Helvetica').fontSize(10).fillColor('#444')
      .text(`Kongshaug Musikkgymnas · generert ${new Date().toLocaleString('nb-NO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Oslo' })}`);
    doc.moveDown(0.7);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000')
      .text(`Til stede: ${overview.present} / ${overview.total}       Borte: ${overview.away}       Mangler: ${overview.missing}`);
    doc.moveDown(0.3);

    for (const dorm of overview.dorms) {
      if (doc.y + 70 > bottom()) doc.addPage();
      doc.moveDown(0.7);
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#000')
        .text(`${dorm.dorm}  (${dorm.present}/${dorm.total} til stede)`, left);
      let uy = doc.y + 2;
      doc.moveTo(left, uy).lineTo(right, uy).lineWidth(1).strokeColor('#000').stroke();

      let y = uy + 8;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#555');
      doc.text('NAVN', cols.name, y); doc.text('ROM', cols.room, y); doc.text('STATUS', cols.status, y); doc.text('TID', cols.time, y);
      y += 15;

      for (const s of dorm.students) {
        if (y + 18 > bottom()) { doc.addPage(); y = 50; }
        const miss = s.status === 'missing';
        doc.font(miss ? 'Helvetica-Bold' : 'Helvetica').fontSize(11).fillColor('#000');
        doc.text(s.fullName, cols.name, y, { width: cols.room - cols.name - 8, ellipsis: true, lineBreak: false });
        doc.text(String(s.room ?? '–'), cols.room, y, { lineBreak: false });
        doc.text(STATUS[s.status] || '', cols.status, y, { lineBreak: false });
        doc.text(s.status === 'present' ? formatCheckedAt(s.checkedAt) : '', cols.time, y, { lineBreak: false });
        y += 17;
        doc.moveTo(left, y - 4).lineTo(right, y - 4).lineWidth(0.4).strokeColor('#e2e2e2').stroke();
      }
      doc.y = y + 2;
    }

    doc.end();
  });
}
