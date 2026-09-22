// Cliente HTTP hacia la API PymEdu (Express + PostgreSQL en Railway).
// En desarrollo usa el proxy de vite.config.ts; en produccion VITE_API_URL
// (o el mismo origen, que es como Railway sirve el SPA + la API).

const API_URL = import.meta.env.VITE_API_URL ?? '';

const TOKEN_KEY = 'pymedu_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${API_URL}${path}`, { ...options, headers, signal: controller.signal });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `Error ${res.status}`);
    }

    return res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('El servidor tardó demasiado en responder. Verifica que la API esté corriendo e inténtalo de nuevo.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const api = {
  // ── Auth ──────────────────────────────────────────────
  login: (email: string, password: string) =>
    request<{ token: string; perfil: Record<string, unknown> }>('/api/auth/login', json({ email, password })),

  register: (email: string, password: string, full_name: string, extra: Record<string, unknown> = {}) =>
    request<{ token: string; perfil: Record<string, unknown> }>('/api/auth/register', json({ email, password, full_name, ...extra })),

  me: () =>
    request<{ perfil: Record<string, unknown> }>('/api/auth/me'),

  // Actualiza datos propios del perfil (negocio, cuenta, notificaciones y contrasena)
  actualizarMiPerfil: (datos: Record<string, unknown>) =>
    request<{ perfil: Record<string, unknown> }>('/api/auth/mi', {
      method: 'PUT',
      body: JSON.stringify(datos),
    }),

  // ── Instituciones ─────────────────────────────────────
  getInstituciones: () =>
    request<{ data: Record<string, unknown>[] }>('/api/instituciones'),

  buscarInstituciones: (q: string) => {
    const query = encodeURIComponent(q);
    return request<{ data: Record<string, unknown>[] }>(`/api/instituciones?q=${query}`);
  },

  // ── Perfiles (admin global) ───────────────────────────
  getPerfiles: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return request<{ data: Record<string, unknown>[]; total: number; hasMore: boolean }>(
      `/api/perfiles${query ? `?${query}` : ''}`
    );
  },

  getRolCounts: () =>
    request<{ data: Record<string, number> }>('/api/admin/perfiles/conteo-por-rol'),

  getPerfilesStats: () =>
    request<Record<string, number>>('/api/perfiles/stats'),

  getPerfilesByInstitucion: (institucionId: string, params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return request<{ data: Record<string, unknown>[] }>(
      `/api/perfiles/institucion/${institucionId}${query ? `?${query}` : ''}`
    );
  },

  getPerfilesStatsByInstitucion: (institucionId: string) =>
    request<{ total: number; coordinadores: number; mentores: number; emprendedores: number }>(
      `/api/perfiles/stats/institucion/${institucionId}`
    ),

  // ── Superadmin: crear usuario ─────────────────────────
  crearUsuario: (payload: Record<string, unknown>) =>
    request<{ perfil: Record<string, unknown> }>('/api/admin/crear-usuario', json(payload)),

  // ── Vinculación ───────────────────────────────────────
  miVinculacion: () =>
    request<{ data: Record<string, unknown> | null }>('/api/vinculacion/mi'),

  solicitarVinculacion: (institucion_id: string) =>
    request<{ ok: boolean }>('/api/vinculacion/solicitar', json({ institucion_id })),

  cancelarSolicitud: (solicitud_id: string) =>
    request<{ ok: boolean }>(`/api/vinculacion/solicitudes/${encodeURIComponent(solicitud_id)}/cancelar`, json({})),

  aprobarSolicitud: (solicitud_id: string, aprobada: boolean) =>
    request<{ ok: boolean }>(`/api/vinculacion/solicitudes/${encodeURIComponent(solicitud_id)}/aprobar`, json({ aprobada })),

  generarCodigo: (institucion_id: string, rol: string, usos_max: number) =>
    request<{ data: string }>('/api/vinculacion/codigos', json({ institucion_id, rol, usos_max })),

  desactivarCodigo: (codigo_id: string) =>
    request<{ ok: boolean }>(`/api/vinculacion/codigos/${encodeURIComponent(codigo_id)}/desactivar`, json({})),

  redimirCodigo: (codigo: string) =>
    request<{ ok: boolean }>('/api/vinculacion/redimir', json({ codigo })),

  getUsuariosInstitucion: (institucionId: string, params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return request<{ data: Record<string, unknown>[] }>(
      `/api/vinculacion/instituciones/${institucionId}/usuarios${query ? `?${query}` : ''}`
    );
  },

  getSolicitudesInstitucion: (institucionId: string) =>
    request<{ data: Record<string, unknown>[] }>(`/api/vinculacion/instituciones/${institucionId}/solicitudes`),

  getCodigosInstitucion: (institucionId: string) =>
    request<{ data: Record<string, unknown>[] }>(`/api/vinculacion/instituciones/${institucionId}/codigos`),

  // ── Membresía ─────────────────────────────────────────
  activarMembresia: (nivel: string, expira: string | null) =>
    request<{ ok: boolean }>('/api/membresia/activar', json({ nivel, expira })),

  // ── ERP (colecciones JSON del usuario) ────────────────
  getErp: () =>
    request<{ data: { coleccion: string; id: string; data: unknown }[] }>('/api/erp'),

  upsertErp: (rows: { coleccion: string; id: string; data: unknown }[]) =>
    request<{ ok: boolean }>('/api/erp/upsert', json({ rows })),

  deleteErp: (coleccion: string, ids: string[]) =>
    request<{ ok: boolean }>('/api/erp/delete', json({ coleccion, ids })),

  // ── Pagos Webpay ──────────────────────────────────────
  crearPagoWebpay: (plan: string, usuario_id: string, email: string) =>
    request<{ token_ws: string; url: string; monto: number; plan: string; buy_order: string }>(
      '/api/pagos/webpay/crear',
      json({ plan, usuario_id, email })
    ),

  getPagoWebpay: (buyOrder: string) =>
    request<{
      data: {
        buy_order: string;
        plan: string;
        monto: number;
        estado: string;
        codigo_autorizacion: string | null;
        tarjeta: string | null;
        created_at: string;
      };
    }>(`/api/pagos/${encodeURIComponent(buyOrder)}`),
};