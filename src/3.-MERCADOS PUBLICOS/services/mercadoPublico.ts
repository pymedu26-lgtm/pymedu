const TICKET = import.meta.env.VITE_MERCADO_PUBLICO_TICKET || '1C04EA61-2DF0-41EC-B56B-F84B67158915';
const BASE_URL = 'https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json';

export interface LicitacionAPI {
  CodigoExterno: string;
  Nombre: string;
  CodigoEstado: number;
  FechaCierre?: string;
}

export interface DetalleLicitacionAPI {
  CodigoExterno: string;
  Nombre: string;
  CodigoEstado: number;
  Descripcion: string;
  FechaCierre: string;
  Estado: string;
  Comprador: {
    NombreOrganismo: string;
    RegionUnidad: string;
  };
  MontoEstimado?: number;
  Items: {
    Listado: Array<{
      NombreProducto: string;
    }>;
  };
}

// Corrección #20: la API pública limita peticiones (HTTP 429). Se cachea 15 min en sessionStorage,
// se reintenta con backoff exponencial (máx. 3) en 429/5xx/red y cada intento tiene timeout.
const TTL_MS = 15 * 60 * 1000;
const TIMEOUT_MS = 10_000;
const MAX_REINTENTOS = 3;
const PREFIJO_CACHE = 'mp_cache:';

const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function leerCache<T>(clave: string): T | null {
  try {
    const crudo = sessionStorage.getItem(PREFIJO_CACHE + clave);
    if (!crudo) return null;
    const { t, v } = JSON.parse(crudo) as { t: number; v: T };
    return Date.now() - t < TTL_MS ? v : null;
  } catch {
    return null;
  }
}

function guardarCache(clave: string, valor: unknown) {
  try {
    sessionStorage.setItem(PREFIJO_CACHE + clave, JSON.stringify({ t: Date.now(), v: valor }));
  } catch { /* cuota llena o storage bloqueado: seguimos sin caché */ }
}

async function pedirListado<T>(query: string, forzar = false): Promise<T[]> {
  if (!forzar) {
    const enCache = leerCache<T[]>(query);
    if (enCache) return enCache;
  }
  let ultimoError = 'No se pudo conectar con Mercado Público.';
  for (let intento = 0; intento <= MAX_REINTENTOS; intento++) {
    if (intento > 0) await esperar(1000 * 2 ** (intento - 1)); // 1 s, 2 s, 4 s
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE_URL}?${query}&ticket=${TICKET}`, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        const listado = (data.Listado ?? []) as T[];
        guardarCache(query, listado);
        return listado;
      }
      ultimoError = res.status === 429
        ? 'Mercado Público está recibiendo demasiadas consultas en este momento (límite de la API).'
        : `Mercado Público respondió con un error (HTTP ${res.status}).`;
      if (res.status !== 429 && res.status < 500) break; // 4xx distinto de 429: reintentar no ayuda
    } catch (error) {
      ultimoError = error instanceof DOMException && error.name === 'AbortError'
        ? 'Mercado Público tardó demasiado en responder.'
        : 'No se pudo conectar con Mercado Público. Revisa tu conexión.';
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(ultimoError);
}

export const mercadoPublicoService = {
  /** Licitaciones activas. Lanza Error con un mensaje legible si la API no responde. */
  getLicitacionesHoy(forzar = false) {
    return pedirListado<LicitacionAPI>('estado=activas', forzar);
  },

  /** Detalle de una licitación; null si no se pudo obtener (la vista usa los datos básicos). */
  async getDetalleLicitacion(codigo: string) {
    try {
      const listado = await pedirListado<DetalleLicitacionAPI>(`codigo=${encodeURIComponent(codigo)}`);
      return listado[0] ?? null;
    } catch {
      return null;
    }
  },
};
