import type { Venta } from '../context/ERPContext';
import { DOCUMENT_LABELS, STATUS_LABELS, normalizeDocumentType } from './documentCompliance';

/** Datos del emisor tomados del perfil. Todos opcionales: si faltan, no se imprime la línea. */
export interface DatosEmisor {
  nombre?: string;
  rut?: string;
  giro?: string;
  direccion?: string;
  comuna?: string;
  logoUrl?: string;
}

const TIPOS_METODO: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
  mixto: 'Mixto',
  cheque: 'Cheque',
};

const MONEDA = (valor: number) => `$${Math.round(valor || 0).toLocaleString('es-CL')}`;

const sinDato = (v?: string) => (v ?? '').trim();

/** El folio real del documento: documento electrónico, folio de la carga masiva o, en su defecto, el id interno. */
function folioVenta(venta: Venta): string {
  if (sinDato(venta.documento_id)) return venta.documento_id!.trim();
  const masivo = venta.nota?.match(/Folio masiva:\s*(.+)$/i)?.[1]?.trim();
  if (masivo) return masivo;
  return venta.id;
}

function fechaLegible(fecha?: string): string {
  if (!fecha) return '-';
  const [f] = fecha.split('T');
  const partes = f.split('-');
  if (partes.length === 3) return `${partes[2]}-${partes[1]}-${partes[0]}`;
  return f;
}

/** Carga la imagen del logo desde su URL. Si falla o no hay, el PDF sigue igual. */
async function cargarLogo(url?: string): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const lector = new FileReader();
      lector.onload = () => resolve(typeof lector.result === 'string' ? lector.result : null);
      lector.onerror = () => resolve(null);
      lector.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Genera la nota de venta en PDF y la abre en una pestaña nueva para previsualizar y descargar.
 * jspdf y autotable se cargan bajo demanda: no pesan en la carga inicial de la app.
 */
export async function abrirPdfNotaVenta(venta: Venta, emisor: DatosEmisor = {}): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  const ancho = doc.internal.pageSize.getWidth();
  const margen = 14;
  const derecha = ancho - margen;
  let y = 18;

  const azul: [number, number, number] = [30, 58, 138];
  const gris: [number, number, number] = [100, 116, 139];

  /* ── Emisor ── */
  const logo = await cargarLogo(emisor.logoUrl);
  if (logo) {
    try {
      doc.addImage(logo, undefined, margen, y - 1, 16, 16, undefined, 'FAST');
    } catch {
      /* imagen no utilizable: se sigue sin logo */
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...azul);
  doc.text(sinDato(emisor.nombre) || 'Mi PYME', logo ? margen + 19 : margen, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...gris);
  const datosEmisor = [sinDato(emisor.rut) && `RUT ${sinDato(emisor.rut)}`, sinDato(emisor.giro)]
    .filter(Boolean)
    .join('  |  ');
  if (datosEmisor) {
    y += 5;
    doc.text(datosEmisor, logo ? margen + 19 : margen, y);
  }
  const direccion = [sinDato(emisor.direccion), sinDato(emisor.comuna)].filter(Boolean).join(', ');
  if (direccion) {
    y += 4.5;
    doc.text(direccion, logo ? margen + 19 : margen, y);
  }

  /* ── Tipo de documento ── */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...azul);
  const titulo = DOCUMENT_LABELS[normalizeDocumentType(venta.tipo_documento)] || 'Nota de Venta';
  doc.text(titulo, derecha, y, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...gris);
  y += 5;
  doc.text(venta.estado === 'Pagado' ? 'COMPROBANTE DE PAGO' : 'DOCUMENTO PENDIENTE', derecha, y, {
    align: 'right',
  });

  y = Math.max(y, 34) + 6;

  /* ── Folio, fecha y cliente ── */
  const altoBloque = 20;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margen, y, ancho - margen * 2, altoBloque, 2, 2, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(...gris);
  doc.text('FOLIO', margen + 4, y + 6.5);
  doc.text('FECHA', margen + 4, y + 14.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(folioVenta(venta), margen + 4, y + 11.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(fechaLegible(venta.fecha), margen + 4, y + 19);

  const colCliente = margen + 4 + (ancho - margen * 2) / 2;
  doc.setFontSize(8);
  doc.setTextColor(...gris);
  doc.text('CLIENTE', colCliente, y + 6.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(venta.cliente || '-', colCliente, y + 11.5, { maxWidth: (ancho - margen * 2) / 2 - 8 });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...gris);
  const estadoDoc = venta.estado_documento ? STATUS_LABELS[venta.estado_documento] : null;
  doc.text(estadoDoc ? `Estado documento: ${estadoDoc}` : venta.estado, colCliente, y + 17, {
    maxWidth: (ancho - margen * 2) / 2 - 8,
  });

  y += altoBloque + 8;

  /* ── Detalle ── */
  const filas = venta.productos.map((p, i) => [
    String(i + 1),
    p.productoNombre || 'Ítem',
    String(p.cantidad ?? 0),
    MONEDA(p.precioBase),
    MONEDA(p.subtotal),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Descripción', 'Cant.', 'P. Unit.', 'Subtotal']],
    body: filas,
    margin: { left: margen, right: margen },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 2.2,
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: azul,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
    },
  });

  const finTabla = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  y = finTabla + 8;

  /* ── Totales ── */
  const anchoCaja = 82;
  const xCaja = derecha - anchoCaja;
  const lineas: [string, string][] = [['Subtotal', MONEDA(venta.subtotal)], ['IVA', MONEDA(venta.iva)]];
  if (venta.propina) lineas.push(['Propina', MONEDA(venta.propina)]);

  doc.setFontSize(9.5);
  lineas.forEach(([concepto, valor], i) => {
    const fila = y + i * 6;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(concepto, xCaja, fila, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    doc.text(valor, derecha, fila, { align: 'right' });
  });

  const yTotal = y + lineas.length * 6 + 1;
  doc.setDrawColor(...azul);
  doc.setLineWidth(0.3);
  doc.line(xCaja, yTotal - 4.5, derecha, yTotal - 4.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...azul);
  doc.text('TOTAL', xCaja, yTotal + 1.5, { align: 'right' });
  doc.text(MONEDA(venta.monto), derecha, yTotal + 1.5, { align: 'right' });

  const metodo = TIPOS_METODO[venta.metodo_pago ?? 'efectivo'] ?? venta.metodo_pago;
  if (metodo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...gris);
    doc.text(`Método de pago: ${metodo}`, xCaja, yTotal + 8, { align: 'right' });
  }

  y = Math.max(yTotal + 16, 150);

  /* ── Nota ── */
  const nota = venta.nota?.replace(/Folio masiva:\s*.+$/i, '').trim();
  if (nota) {
    doc.setFontSize(8.5);
    doc.setTextColor(...gris);
    const altoNota = doc.splitTextToSize(nota, ancho - margen * 2).length * 4;
    doc.text(nota, margen, y, { maxWidth: ancho - margen * 2 });
    y += altoNota + 4;
  }

  /* ── Pie ── */
  doc.setFontSize(8);
  doc.setTextColor(...gris);
  doc.text(
    venta.tipo_documento?.includes('exenta')
      ? 'Documento exento de IVA. No válido como factura electrónica ante el SII.'
      : 'Gracias por su compra. Documento no válido como factura electrónica ante el SII.',
    ancho / 2,
    doc.internal.pageSize.getHeight() - 12,
    { align: 'center' }
  );

  /* ── Abre en pestaña nueva para previsualizar y descargar ── */
  const nombreArchivo = `${titulo.replace(/\s+/g, '-').toLowerCase()}-${folioVenta(venta).replace(/[^\w-]+/g, '')}.pdf`;
  const url = URL.createObjectURL(doc.output('blob'));
  const pestana = window.open(url, '_blank');
  if (!pestana) {
    window.open(url, '_blank', 'noopener');
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
