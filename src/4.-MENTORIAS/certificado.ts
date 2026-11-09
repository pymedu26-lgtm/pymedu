// Certificado PDF generado en el navegador (jsPDF se carga solo al descargar).
import type { Certificado } from './tipos';
import { fecha } from './util';

export const urlVerificacion = (codigo: string) => `${window.location.origin}/verificar/${encodeURIComponent(codigo)}`;

export async function descargarCertificado(c: Certificado) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const centro = ancho / 2;
  const texto = (t: string | string[], y: number, tam: number, color: [number, number, number], negrita = false) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.setFontSize(tam);
    doc.setTextColor(...color);
    doc.text(t, centro, y, { align: 'center' });
  };
  const navy: [number, number, number] = [30, 27, 94];
  const gris: [number, number, number] = [90, 95, 118];

  doc.setFillColor(...navy);
  doc.rect(0, 0, ancho, 20, 'F');
  doc.setFillColor(249, 115, 22);
  doc.rect(0, 20, ancho, 2, 'F');
  doc.setDrawColor(227, 229, 238);
  doc.setLineWidth(0.6);
  doc.rect(12, 30, ancho - 24, alto - 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('PymEdu Mentorías', 16, 13);

  texto('Certificado de finalización', 56, 30, navy, true);
  texto('Se certifica que', 74, 13, gris);
  texto(doc.splitTextToSize(c.participante, ancho - 60), 90, 26, [26, 28, 46], true);
  texto('completó satisfactoriamente', 104, 13, gris);
  const titulo = doc.splitTextToSize(`«${c.curso}»`, ancho - 70);
  texto(titulo, 118, 18, [194, 65, 12], true);
  const y = 118 + titulo.length * 8;
  texto(`Ofrecido por ${c.organizacion}`, y + 4, 12, gris);
  texto(`Emitido el ${fecha(c.emitido_en)}`, y + 12, 12, gris);

  const url = urlVerificacion(c.codigo);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...gris);
  doc.text(`Código de verificación: ${c.codigo}`, 20, alto - 22);
  doc.text('Verifica su validez en:', 20, alto - 16);
  doc.setTextColor(29, 78, 216);
  doc.textWithLink(url, 20 + doc.getTextWidth('Verifica su validez en: '), alto - 16, { url });

  doc.save(`certificado-${c.codigo}.pdf`);
}
