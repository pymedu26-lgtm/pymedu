import { randomUUID } from 'crypto';
import { Router } from 'express';
import db from './db.js';
import { requireAuth } from './auth.js';

const router = Router();

const TBK_ENV = process.env.TBK_ENV || 'integracion';
const TBK_BASE_URL = TBK_ENV === 'produccion'
  ? 'https://webpay3g.transbank.cl'
  : 'https://webpay3gint.transbank.cl';
const TBK_COMERCIO_CODIGO = process.env.TBK_COMERCIO_CODIGO || '597055555532';
const TBK_API_KEY_SECRET = process.env.TBK_API_KEY_SECRET || '579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1';

const PLANES = {
  pro: { monto: 10000, duracion_dias: 30, nombre: 'Plan Pro' },
  premium: { monto: 20000, duracion_dias: 90, nombre: 'Plan Premium' },
};

function generarBuyOrder() {
  const fecha = new Date().toISOString().replace(/[-T:.]/g, '').slice(0, 14);
  return `PM-${fecha}-${Math.floor(Math.random() * 90000 + 10000)}`;
}

async function crearTransaccionTbk({ tokenWs, buyOrder, sessionId, monto }) {
  const res = await fetch(`${TBK_BASE_URL}/rswebpaytransaction/api/webpay/v1.2/transactions`, {
    method: 'POST',
    headers: {
      'Tbk-Api-Key-Id': TBK_COMERCIO_CODIGO,
      'Tbk-Api-Key-Secret': TBK_API_KEY_SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      buy_order: buyOrder,
      session_id: sessionId,
      amount: monto,
      return_url: `${process.env.API_PUBLIC_URL || process.env.FRONT_URL || ''}/api/pagos/webpay/retorno`,
    }),
  });

  if (!res.ok) {
    const cuerpo = await res.text().catch(() => '');
    console.error(`[webpay] Transbank HTTP ${res.status}: ${cuerpo.slice(0, 300)}`);
    throw new Error(`Transbank devolvio HTTP ${res.status}`);
  }
  return res.json();
}

async function confirmarTransaccionTbk(tokenWs) {
  const res = await fetch(`${TBK_BASE_URL}/rswebpaytransaction/api/webpay/v1.2/transactions/${encodeURIComponent(tokenWs)}`, {
    method: 'PUT',
    headers: {
      'Tbk-Api-Key-Id': TBK_COMERCIO_CODIGO,
      'Tbk-Api-Key-Secret': TBK_API_KEY_SECRET,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!res.ok) {
    const cuerpo = await res.text().catch(() => '');
    console.error(`[webpay] Confirmacion HTTP ${res.status}: ${cuerpo.slice(0, 300)}`);
    throw new Error(`No se pudo confirmar la transaccion (HTTP ${res.status})`);
  }
  return res.json();
}

async function activarMembresia({ userId, nivel, duracionDias }) {
  if (!['free', 'pro', 'premium'].includes(nivel)) return false;
  const expira = new Date(Date.now() + duracionDias * 24 * 60 * 60 * 1000).toISOString();
  const res = await db.prepare('UPDATE perfiles SET membresia_nivel = ?, membresia_expira = ? WHERE id = ?')
    .run(nivel, expira, userId);
  if (res.changes > 0) {
    console.log(`[webpay] Membresia ${nivel} activada para ${userId} en Railway Postgres`);
    return true;
  }
  console.error('[webpay] No se encontro el perfil para activar membresia:', userId);
  return false;
}

router.post('/webpay/crear', requireAuth, async (req, res) => {
  try {
    const { plan, usuario_id, email } = req.body;
    const configPlan = PLANES[plan];
    if (!configPlan) {
      return res.status(400).json({ error: 'Plan invalido' });
    }
    if (!usuario_id || !email) {
      return res.status(400).json({ error: 'usuario_id y email son requeridos' });
    }

    const buyOrder = generarBuyOrder();
    const sessionId = randomUUID();
    const id = randomUUID();

    await db.prepare(`
      INSERT INTO pagos (id, usuario_id, email, plan, monto, buy_order, session_id, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'iniciado')
    `).run(id, usuario_id, email, plan, configPlan.monto, buyOrder, sessionId);

    const tbk = await crearTransaccionTbk({
      tokenWs: '',
      buyOrder,
      sessionId,
      monto: configPlan.monto,
    });

    await db.prepare('UPDATE pagos SET token_ws = ? WHERE id = ?').run(tbk.token_ws, id);

    res.json({
      token_ws: tbk.token_ws,
      url: tbk.url,
      monto: configPlan.monto,
      plan,
      buy_order: buyOrder,
    });
  } catch (error) {
    console.error('[webpay] Error creando transaccion:', error);
    res.status(500).json({ error: 'No se pudo iniciar la transaccion Webpay' });
  }
});

// Webpay puede redirigir por POST (form) o por GET (anulacion/timeout), y en caso
// de cancelacion envia TBK_TOKEN en vez de token_ws.
router.use('/webpay/retorno', (req, res, next) => {
  if (req.method === 'GET' && !req.query.token_ws && (req.query.TBK_TOKEN || req.body?.TBK_TOKEN)) {
    req.body = { TBK_TOKEN: req.query.TBK_TOKEN || req.body.TBK_TOKEN };
  }
  next();
});

router.post('/webpay/retorno', async (req, res) => {
  const frenteUrl = process.env.FRONT_URL || '';
  const irAResultado = (estado, orden = '') =>
    res.redirect(303, `${frenteUrl}/erp/suscripcion/resultado?estado=${encodeURIComponent(estado)}&orden=${encodeURIComponent(orden)}`);

  try {
    const tokenWs = req.body.token_ws || req.query.token_ws;
    const tbkToken = req.body.TBK_TOKEN || req.query.TBK_TOKEN;

    // Pago anulado por el usuario o timeout: Webpay envia TBK_TOKEN
    if (tbkToken && !tokenWs) {
      await db.prepare("UPDATE pagos SET estado = 'cancelado', updated_at = now() WHERE token_ws = ?").run(tbkToken);
      return irAResultado('cancelado');
    }

    if (!tokenWs) {
      return irAResultado('error');
    }

    const confirmacion = await confirmarTransaccionTbk(tokenWs);
    const aprobada = confirmacion.response_code === 0;

    const pago = await db.prepare('SELECT * FROM pagos WHERE token_ws = ?').get(tokenWs);

    if (!pago) {
      return irAResultado('error');
    }

    const nuevoEstado = aprobada ? 'pagada' : 'rechazada';
    await db.prepare(`
      UPDATE pagos
      SET estado = ?, codigo_autorizacion = ?, tarjeta = ?, respuesta_tbk = ?, updated_at = now()
      WHERE id = ?
    `).run(
      nuevoEstado,
      aprobada ? String(confirmacion.authorization_code ?? '') : null,
      confirmacion.card_detail?.card_number ? `**** ${confirmacion.card_detail.card_number}` : null,
      JSON.stringify(confirmacion),
      pago.id
    );

    if (aprobada) {
      await activarMembresia({
        userId: pago.usuario_id,
        nivel: pago.plan,
        duracionDias: PLANES[pago.plan]?.duracion_dias || 30,
      });
      return irAResultado('aprobado', pago.buy_order);
    }
    return irAResultado('rechazado', pago.buy_order);
  } catch (error) {
    console.error('[webpay] Error en retorno:', error);
    return irAResultado('error');
  }
});

router.get('/:buyOrder', requireAuth, async (req, res) => {
  try {
    const pago = await db.prepare('SELECT * FROM pagos WHERE buy_order = ?').get(req.params.buyOrder);
    if (!pago) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }
    res.json({
      data: {
        id: pago.id,
        buy_order: pago.buy_order,
        estado: pago.estado,
        plan: pago.plan,
        monto: pago.monto,
        email: pago.email,
        codigo_autorizacion: pago.codigo_autorizacion,
        tarjeta: pago.tarjeta,
        created_at: pago.created_at,
      },
    });
  } catch (error) {
    console.error('[webpay] Error obteniendo pago:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
