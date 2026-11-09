const TICKET = import.meta.env.VITE_MERCADO_PUBLICO_TICKET || '1C04EA61-2DF0-41EC-B56B-F84B67158915';
const BASE_URL = 'https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json';

/** Cache del listado: se reutiliza por 5 minutos para no golpear la API. */
const TTL_LISTADO_MS = 5 * 60 * 1000;
/** Cache de detalles: cambian poco durante el dia. */
const TTL_DETALLE_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;
const REINTENTOS = 2;
/** Espacio minimo entre llamadas para no gatillar el limite de la API. */
const RITMO_MS = 400;
const ENFRIAMIENTO_429_MS = 60 * 1000;

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

export type TipoErrorMercado = 'rate_limit' | 'timeout' | 'red' | 'api';

export class MercadoPublicoError extends Error {
  tipo: TipoErrorMercado;
  reintentar: boolean;

  constructor(tipo: TipoErrorMercado, mensaje: string, reintentar: boolean) {
    super(mensaje);
    this.name = 'MercadoPublicoError';
    this.tipo = tipo;
    this.reintentar = reintentar;
  }
}

export interface ResultadoListado {
  items: LicitacionAPI[];
  desdeCache: boolean;
  actualizadoEn: number;
  desactualizado: boolean;
}

interface EntradaCache<T> {
  valor: T;
  guardadoEn: number;
}

let cacheListado: EntradaCache<LicitacionAPI[]> | null = null;
const cacheDetalles = new Map<string, EntradaCache<DetalleLicitacionAPI>>();
let bloqueadoHasta = 0;
let ultimaLlamada = 0;

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function respetarRitmo() {
  const desdeUltima = Date.now() - ultimaLlamada;
  if (desdeUltima < RITMO_MS) await esperar(RITMO_MS - desdeUltima);
  ultimaLlamada = Date.now();
}

function errorDeRed(error: unknown): MercadoPublicoError {
  const nombre = (error as { name?: string } | null)?.name;
  if (nombre === 'AbortError') {
    return new MercadoPublicoError('timeout', 'La API de Mercado Público tardó demasiado en responder.', true);
  }
  return new MercadoPublicoError('red', 'No se pudo conectar con la API de Mercado Público. Revisa tu conexión.', true);
}

/**
 * Peticion con timeout, ritmo limitado y reintentos con espera creciente.
 * Un 429 bloquea las llamadas durante un minuto en vez de reintentar en bucle.
 */
async function pedirJson<T>(url: string): Promise<T> {
  if (Date.now() < bloqueadoHasta) {
    const segundos = Math.ceil((bloqueadoHasta - Date.now()) / 1000);
    throw new MercadoPublicoError(
      'rate_limit',
      `La API está limitando las solicitudes. Espera ${segundos} segundo${segundos === 1 ? '' : 's'} y vuelve a intentar.`,
      false,
    );
  }

  let ultimoError: MercadoPublicoError = new MercadoPublicoError('red', 'No se pudo conectar con la API.', true);

  for (let intento = 0; intento <= REINTENTOS; intento++) {
    await respetarRitmo();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (response.status === 429) {
        bloqueadoHasta = Date.now() + ENFRIAMIENTO_429_MS;
        throw new MercadoPublicoError(
          'rate_limit',
          'La API de Mercado Público rechazó las solicitudes por exceso de uso (429). Espera un minuto y vuelve a intentar.',
          false,
        );
      }

      if (response.status >= 500) {
        throw new MercadoPublicoError('api', 'La API de Mercado Público está teniendo problemas. Intenta nuevamente en unos minutos.', true);
      }

      if (!response.ok) {
        throw new MercadoPublicoError('api', `La API de Mercado Público respondió con error ${response.status}.`, false);
      }

      return (await response.json()) as T;
    } catch (error) {
      ultimoError = error instanceof MercadoPublicoError ? error : errorDeRed(error);
      if (!ultimoError.reintentar || intento === REINTENTOS) throw ultimoError;
      await esperar(800 * 2 ** intento);
    } finally {
      clearTimeout(timer);
    }
  }

  throw ultimoError;
}

function listadoDesdeCache(desactualizado: boolean): ResultadoListado {
  return {
    items: cacheListado?.valor ?? [],
    desdeCache: true,
    actualizadoEn: cacheListado?.guardadoEn ?? 0,
    desactualizado,
  };
}

export const mercadoPublicoService = {
  /** Listado de licitaciones activas. Usa cache y propaga errores tipados. */
  async getLicitacionesHoy(forceRefresh = false): Promise<ResultadoListado> {
    const ahora = Date.now();
    if (!forceRefresh && cacheListado && ahora - cacheListado.guardadoEn < TTL_LISTADO_MS) {
      return listadoDesdeCache(false);
    }

    try {
      const data = await pedirJson<{ Listado?: LicitacionAPI[] }>(`${BASE_URL}?estado=activas&ticket=${TICKET}`);
      const items = Array.isArray(data.Listado) ? data.Listado : [];
      cacheListado = { valor: items, guardadoEn: Date.now() };
      return { items, desdeCache: false, actualizadoEn: cacheListado.guardadoEn, desactualizado: false };
    } catch (error) {
      // Si ya hay datos buenos, mostrarlos antes que dejar la pantalla vacia.
      if (cacheListado) return listadoDesdeCache(true);
      throw error;
    }
  },

  /** Detalle puntual de una licitacion, con cache por codigo. */
  async getDetalleLicitacion(codigo: string): Promise<DetalleLicitacionAPI | null> {
    const cache = cacheDetalles.get(codigo);
    if (cache && Date.now() - cache.guardadoEn < TTL_DETALLE_MS) return cache.valor;

    const data = await pedirJson<{ Listado?: DetalleLicitacionAPI[] }>(
      `${BASE_URL}?codigo=${encodeURIComponent(codigo)}&ticket=${TICKET}`,
    );
    const detalle = Array.isArray(data.Listado) && data.Listado.length > 0 ? data.Listado[0] : null;
    if (detalle) cacheDetalles.set(codigo, { valor: detalle, guardadoEn: Date.now() });
    return detalle;
  },

  /** Limpia la cache (util para el boton de refrescar de la pantalla). */
  limpiarCache() {
    cacheListado = null;
    cacheDetalles.clear();
    bloqueadoHasta = 0;
  },

  /** Indica si la API esta en enfriamiento por un 429 reciente. */
  enEnfriamiento(): boolean {
    return Date.now() < bloqueadoHasta;
  },
};
