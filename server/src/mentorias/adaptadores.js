// Integraciones de Mentorías detrás de adaptadores (regla del documento de arquitectura):
// cambiar YouTube, R2, Resend o Google Calendar = escribir otro adaptador con la misma
// interfaz; las rutas y pantallas no cambian.
import { createHmac, timingSafeEqual } from 'crypto';

const SECRETO = () => process.env.JWT_SECRET || 'pymedu-secret-key-change-in-production';

/** ProveedorVideo (MVP: YouTube «no listado» pegado por el proveedor; no consume cuota de API). */
export const ProveedorVideo = {
  idDesdeUrl(url = '') {
    const m = String(url).match(/(?:youtu\.be\/|[?&]v=|embed\/|shorts\/|live\/)([\w-]{11})/);
    return m ? m[1] : null;
  },
  miniatura(url) {
    const id = this.idDesdeUrl(url);
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
  },
};

/** ProveedorArchivos: enlaces firmados de corta duración (MVP: firma HMAC propia; al escalar, URL firmada de R2/S3). */
export const ProveedorArchivos = {
  DURACION_MS: 10 * 60 * 1000,
  firmar(recursoId, usuarioId, ahora = Date.now()) {
    const exp = ahora + this.DURACION_MS;
    const firma = createHmac('sha256', SECRETO()).update(`${recursoId}.${usuarioId}.${exp}`).digest('hex');
    return { url: `/api/mentorias/recursos/${encodeURIComponent(recursoId)}/descargar?u=${encodeURIComponent(usuarioId)}&exp=${exp}&firma=${firma}`, expira_en: new Date(exp).toISOString() };
  },
  verificar(recursoId, usuarioId, exp, firma) {
    // Formato exacto: Buffer.from(hex) ignora dígitos sobrantes y aceptaría firmas alteradas.
    if (!/^[0-9a-f]{64}$/.test(String(firma ?? '')) || !(Number(exp) >= Date.now())) return false;
    const esperada = createHmac('sha256', SECRETO()).update(`${recursoId}.${usuarioId}.${exp}`).digest();
    const recibida = Buffer.from(String(firma), 'hex');
    return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
  },
};

/** ProveedorCorreo (MVP: Resend — 3.000/mes, 100/día). Sin RESEND_API_KEY solo registra en consola. */
export const ProveedorCorreo = {
  async enviar({ para, asunto, html, adjuntos = [] }) {
    if (!process.env.RESEND_API_KEY) {
      console.log(`[correo:simulado] → ${para} · ${asunto}${adjuntos.length ? ` (+${adjuntos.length} adjunto)` : ''}`);
      return { simulado: true };
    }
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.CORREO_REMITENTE || 'PymEdu <no-responder@pymedu.cl>', to: para, subject: asunto, html, attachments: adjuntos }),
    });
    return r.json();
  },
};

/** ProveedorCalendario: archivo .ics (funciona con Google, Outlook y Apple sin integración). */
export const ProveedorCalendario = {
  ics({ uid, titulo, inicio, fin, url }) {
    const f = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const texto = (t) => String(t).replace(/([\\;,])/g, '\\$1').replace(/\r?\n/g, '\\n'); // escape RFC 5545
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PymEdu//Mentorias//ES', 'BEGIN:VEVENT',
      `UID:${uid}@pymedu.cl`, `DTSTAMP:${f(Date.now())}`, `DTSTART:${f(inicio)}`, `DTEND:${f(fin)}`,
      `SUMMARY:${texto(titulo)}`, url ? `LOCATION:${texto(url)}` : '', url ? `URL:${url}` : '', 'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', `DESCRIPTION:${texto(titulo)}`, 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ].filter(Boolean).join('\r\n');
  },
};

/** Fecha-hora en hora de Chile para textos («jueves 14 a las 10:00»). */
export function fechaChile(fecha) {
  const d = new Date(fecha);
  const dia = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', weekday: 'long', day: 'numeric' }).format(d);
  const hora = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${dia} a las ${hora}`;
}
