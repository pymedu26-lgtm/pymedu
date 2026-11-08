// Datos de DEMOSTRACIÓN para el modo local (o SEED_DEMO=1). Idempotente: solo inserta
// si no existen. Nunca corre en Railway salvo que se active SEED_DEMO=1 a propósito.
//  - Mentorías: proveedor, curador, comunidad, cursos en todos los estados, grupos y sesiones.
//  - ERP: 6 meses de ventas, gastos, cobros, inventario (incluye productos fraccionables)
//    para la cuenta emprendedor@pymedu.com.
import db from '../db.js';
import { randomUUID } from 'crypto';

const INST_SAN_JOSE = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const ORG_PROVEEDOR = 'org-consultora-crece';
const ORG_PLATAFORMA = 'org-pymedu-plataforma';
const VIDEO_DEMO = 'https://www.youtube.com/watch?v=M7lc1UVf-VE'; // video de ejemplo de la API de YouTube

const uno = (sql, ...p) => db.prepare(sql).get(...p);
const ejecutar = (sql, ...p) => db.prepare(sql).run(...p);
const idDe = async (email) => (await uno('SELECT id, nombre_completo FROM perfiles WHERE email = ?', email)) ?? null;

/** PRNG determinista (mismos datos en cada máquina). */
function azar(semilla) {
  let a = semilla;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const masDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** Próximo día de la semana (0=dom … 4=jue) a una hora UTC. */
function proximo(diaSemana, horaUTC, semanas = 0) {
  const d = new Date();
  d.setUTCHours(horaUTC, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + ((diaSemana - d.getUTCDay() + 7) % 7 || 7) + semanas * 7);
  return d;
}

export async function sembrarDemoLocal() {
  await sembrarMentorias();
  await sembrarErp();
}

// ═══════════════════════════════ Mentorías ═══════════════════════════════

async function sembrarMentorias() {
  const proveedor = await idDe('proveedor@pymedu.com');
  const curador = await idDe('curador@pymedu.com');
  const emprendedor = await idDe('emprendedor@pymedu.com');
  const mentor = await idDe('mentor@colegiosanjose.cl');

  await ejecutar(`INSERT INTO cuentas.organizacion (id, tipo, nombre, rut, area_experiencia, estado, verificado_en)
    VALUES (?, 'proveedor', 'Consultora Crece', '77.555.444-3', 'Finanzas y ventas para mypes', 'activa', now()) ON CONFLICT (id) DO NOTHING`, ORG_PROVEEDOR);
  if (proveedor) {
    await ejecutar(`INSERT INTO cuentas.asignacion_rol (usuario_id, rol_id, organizacion_id, otorgado_por)
      SELECT ?, id, ?, 'demo' FROM cuentas.rol WHERE codigo = 'admin_proveedor' AND organizacion_id IS NULL ON CONFLICT DO NOTHING`, proveedor.id, ORG_PROVEEDOR);
  }
  if (curador) await ejecutar('INSERT INTO mentorias.curador (usuario_id, nombrado_por) VALUES (?, ?) ON CONFLICT DO NOTHING', curador.id, 'demo');
  // El emprendedor demo pertenece a la comunidad San José → ve su contenido cerrado.
  if (emprendedor) {
    await ejecutar(`INSERT INTO cuentas.membresia_comunidad (usuario_id, comunidad_id, estado, aprobado_por, resuelto_en, datos_validacion)
      VALUES (?, ?, 'aprobada', 'demo', now(), '{"comuna":"Santiago"}'::jsonb) ON CONFLICT DO NOTHING`, emprendedor.id, INST_SAN_JOSE);
  }

  if ((await uno('SELECT count(*)::int AS n FROM mentorias.curso')).n > 0) return;

  const org = {
    pymedu: [ORG_PLATAFORMA, 'PymEdu', 'plataforma'],
    crece: [ORG_PROVEEDOR, 'Consultora Crece', 'proveedor'],
    sanjose: [INST_SAN_JOSE, 'Instituto San Jose', 'institucion'],
  };
  const cursos = [
    { k: 'caja', o: 'pymedu', t: 'Ordena tu flujo de caja', f: 'curso', v: 'publico', cat: 'gestion-financiera', n: 'semilla', d: 'basico', p: 0, min: 95, r: 'video', dest: true, erp: ['flujo_caja'],
      desc: 'Aprende a registrar entradas y salidas, proyectar tu caja a 90 días y anticipar meses difíciles con la información que ya tienes en el ERP.',
      obj: ['Proyectar la caja de los próximos 3 meses', 'Detectar a tiempo meses con déficit'], mods: [['Fundamentos', 2], ['Proyección', 2], ['Plan de acción', 2]] },
    { k: 'erp', o: 'pymedu', t: 'Domina el ERP en 5 pasos', f: 'curso', v: 'publico', cat: 'estrategia-erp', n: 'crecimiento', d: 'intermedio', p: 0, min: 48, r: 'video', dest: true, erp: ['inventario', 'ventas'],
      desc: 'Desde la carga de productos hasta el cierre mensual: los cinco hábitos que hacen que tus cifras sean confiables todos los días.',
      obj: ['Reducir en 20 % el tiempo de reportes', 'Integrar inventario y ventas'], mods: [['Configuración inicial', 2], ['Operación diaria', 2], ['Cierre del mes', 1]], candados: true },
    { k: 'cobranza', o: 'crece', t: 'Cobranza sin perder clientes', f: 'mentoria_grupal', v: 'publico', cat: 'ventas-cobranza', n: 'crecimiento', d: 'intermedio', p: 12000, min: 240, r: 'video', dest: true, erp: ['cobranza'],
      desc: 'Mentoría grupal de 4 sesiones para recuperar cuentas por cobrar con guiones, plazos y acuerdos de pago, cuidando la relación con tus clientes.',
      obj: ['Bajar los días de cobro', 'Negociar acuerdos de pago'], mods: [['Diagnóstico de tu cartera', 2], ['Conversaciones de cobro', 2]], grupo: { cupos: 8, ses: 4, mentor: 'Marcela Soto' } },
    { k: 'f29', o: 'pymedu', t: 'Webinar: F29 sin errores', f: 'taller', v: 'publico', cat: 'legal-tributario', n: 'semilla', d: 'basico', p: 0, min: 60, r: 'video', erp: [],
      desc: 'Taller abierto en vivo: cómo preparar tu declaración mensual de IVA con los datos del ERP y qué revisar antes de enviarla.',
      obj: ['Entender débito y crédito fiscal', 'Evitar multas por atraso'], mods: [['Taller en vivo', 1]], grupo: { cupos: 200, ses: 1, mentor: 'Equipo PymEdu', horaUTC: 22, dia: 2 } },
    { k: 'local', o: 'sanjose', t: 'Marketing local para emprendedores San José', f: 'mentoria_grupal', v: 'comunidad', cat: 'marketing-digital', n: 'semilla', d: 'basico', p: 0, min: 180, r: 'video', erp: ['ventas'],
      desc: 'Programa exclusivo de la comunidad San José: redes sociales, alianzas con el barrio y promociones que sí funcionan en tu comuna.',
      obj: ['Publicar con constancia', 'Conseguir los primeros 50 clientes locales'], mods: [['Tu cliente ideal', 2], ['Redes y comunidad', 2]], grupo: { cupos: 15, ses: 3, mentor: 'Mentor San Jose', mentorId: true } },
    { k: 'liderazgo', o: 'crece', t: 'Liderazgo en tiempos de crisis', f: 'curso', v: 'publico', cat: 'liderazgo', n: 'escala', d: 'avanzado', p: 25000, min: 75, r: 'audio', erp: [],
      desc: 'Podcast en 6 episodios para dirigir equipos remotos y tomar decisiones difíciles sin perder a tu gente.',
      obj: ['Comunicar malas noticias', 'Priorizar con datos'], mods: [['Episodios', 3]] },
    { k: 'plan', o: 'pymedu', t: 'Plan de negocios 2027', f: 'curso', v: 'publico', cat: 'gestion-financiera', n: 'semilla', d: 'basico', p: 0, min: 30, r: 'pdf', erp: ['flujo_caja'],
      desc: 'Plantilla descargable y guía paso a paso para proyectar tu año fiscal y presentarlo a un banco o fondo concursable.',
      obj: ['Armar tu plan en una tarde'], mods: [['Guía', 2]] },
    // Estados de gestión para probar la cola de revisión
    { k: 'insta', o: 'crece', t: 'Instagram para mypes', f: 'curso', v: 'publico', cat: 'marketing-digital', n: 'semilla', d: 'basico', p: 9900, min: 50, r: 'video', estado: 'en_revision', erp: [],
      desc: 'Contenido, horarios y métricas para vender por Instagram sin pagar publicidad.', obj: ['Publicar 3 veces por semana'], mods: [['Contenido', 2]] },
    { k: 'costos', o: 'sanjose', t: 'Taller de costos para socios San José', f: 'taller', v: 'comunidad', cat: 'gestion-financiera', n: 'crecimiento', d: 'intermedio', p: 0, min: 90, r: 'video', estado: 'en_revision', erp: [],
      desc: 'Cómo calcular tu costo real por producto y fijar precios con margen.', obj: ['Calcular el costo unitario'], mods: [['Costeo', 1]] },
    { k: 'rico', o: 'crece', t: 'Hazte rico vendiendo por internet', f: 'curso', v: 'publico', cat: 'ventas-cobranza', n: 'semilla', d: 'basico', p: 49000, min: 20, r: 'video', estado: 'rechazado', erp: [],
      motivo: 'Promete ingresos garantizados sin respaldo (información engañosa) y el precio no corresponde al contenido.',
      desc: 'Gana un millón al mes desde tu casa.', obj: [], mods: [['Intro', 1]] },
  ];

  const ids = {};
  for (const c of cursos) {
    const [orgId, orgNombre, orgTipo] = org[c.o];
    const estado = c.estado ?? 'publicado';
    const fila = await uno(`
      INSERT INTO mentorias.curso (organizacion_id, organizacion_nombre, organizacion_tipo, titulo, descripcion, objetivos, formato, visibilidad,
        comunidad_id, categoria_slug, nivel_madurez, dificultad, precio, duracion_min, miniatura_url, tipo_recurso_principal,
        mentor_id, mentor_nombre, estado, motivo_rechazo, destacado, etiquetas_erp, creado_por, enviado_revision_en, publicado_en)
      VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::text[], ?, now(), ?) RETURNING id`,
    orgId, orgNombre, orgTipo, c.t, c.desc, JSON.stringify(c.obj), c.f, c.v, c.v === 'comunidad' ? INST_SAN_JOSE : null, c.cat, c.n, c.d, c.p, c.min,
    c.r === 'video' ? 'https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg' : null, c.r,
    c.grupo?.mentorId ? mentor?.id ?? null : null, c.grupo?.mentor ?? (c.o === 'crece' ? 'Marcela Soto' : 'Equipo PymEdu'),
    estado, c.motivo ?? null, !!c.dest, `{${c.erp.join(',')}}`, c.o === 'crece' ? proveedor?.id ?? null : null,
    estado === 'publicado' ? new Date(Date.now() - (cursos.indexOf(c) + 1) * 86_400_000) : null);
    ids[c.k] = fila.id;

    let paso = 0;
    for (const [mi, [titulo, n]] of c.mods.entries()) {
      const m = await uno('INSERT INTO mentorias.modulo (curso_id, orden, titulo) VALUES (?, ?, ?) RETURNING id', fila.id, mi + 1, titulo);
      for (let li = 1; li <= n; li++) {
        paso++;
        const tipo = c.r === 'pdf' ? 'pdf' : c.r === 'audio' ? 'audio' : li === n && mi === c.mods.length - 1 && c.f === 'curso' ? 'tarea' : 'video';
        // En «Domina el ERP» el último paso abre el próximo jueves y el 4.º exige completar el anterior.
        const disponible = c.candados && paso === 5 ? proximo(4, 13) : null;
        await ejecutar(`INSERT INTO mentorias.leccion (modulo_id, curso_id, orden, titulo, tipo, url_recurso, duracion_min, disponible_desde, requiere_anterior)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, m.id, fila.id, li, `${titulo}: parte ${li}`, tipo, tipo === 'video' ? VIDEO_DEMO : null,
        Math.max(5, Math.round(c.min / (c.mods.length * n))), disponible, !!(c.candados && paso === 4));
      }
    }
    await ejecutar("INSERT INTO mentorias.recurso (curso_id, nombre, tipo, peso_kb, url_almacenamiento) VALUES (?, ?, 'pdf', 2450, 'demo://guia'), (?, ?, 'xlsx', 1100, 'demo://plantilla')",
      fila.id, `Guía · ${c.t}`, fila.id, 'Plantilla de trabajo');

    if (c.grupo) {
      const inicio = proximo(c.grupo.dia ?? 4, c.grupo.horaUTC ?? 13);
      const g = await uno(`INSERT INTO mentorias.grupo (curso_id, mentor_id, mentor_nombre, nombre, fecha_inicio, fecha_fin, cupos)
        VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`, fila.id, c.grupo.mentorId ? mentor?.id ?? null : null, c.grupo.mentor,
      `Grupo ${new Intl.DateTimeFormat('es-CL', { month: 'long' }).format(inicio)}`, iso(inicio), iso(masDias(inicio, 7 * c.grupo.ses)), c.grupo.cupos);
      for (let s = 0; s < c.grupo.ses; s++) {
        const ini = masDias(inicio, 7 * s);
        await ejecutar('INSERT INTO mentorias.sesion (grupo_id, inicio, fin, url_sala) VALUES (?, ?, ?, ?)',
          g.id, ini, new Date(ini.getTime() + 60 * 60_000), 'https://meet.google.com/demo-pymedu');
      }
      ids[`${c.k}_grupo`] = g.id;
    }
  }

  // Cupo institucional: San José compró 10 cupos de «Cobranza» para su comunidad.
  await ejecutar('INSERT INTO mentorias.cupos_institucionales (comunidad_id, curso_id, cupos, vigencia_hasta) VALUES (?, ?, 10, ?)',
    INST_SAN_JOSE, ids.cobranza, iso(masDias(new Date(), 180)));

  // Comentarios
  const comentarios = [[ids.caja, 'Carolina P.', 5, 'Me ahorró semanas: ahora sé qué mes voy a estar justo.'], [ids.caja, 'Jorge M.', 4, 'Muy claro, faltó un ejemplo con estacionalidad.'],
    [ids.erp, 'Daniela R.', 5, 'Los 5 pasos son oro puro.'], [ids.cobranza, 'Luis A.', 5, 'Recuperé tres clientes morosos en una semana.']];
  for (const [curso, nombre, est, texto] of comentarios) {
    await ejecutar('INSERT INTO mentorias.comentario (curso_id, usuario_id, usuario_nombre, estrellas, texto) VALUES (?, ?, ?, ?, ?)', curso, randomUUID(), nombre, est, texto);
  }

  // El emprendedor demo: inscrito en «Domina el ERP» (con avance) y en el programa de su comunidad.
  if (emprendedor) {
    const insc = await uno(`INSERT INTO mentorias.inscripcion (usuario_id, usuario_nombre, organizacion_id, curso_id, estado, origen)
      VALUES (?, ?, ?, ?, 'activa', 'gratuito') RETURNING id`, emprendedor.id, emprendedor.nombre_completo, INST_SAN_JOSE, ids.erp);
    await ejecutar(`INSERT INTO mentorias.progreso_leccion (inscripcion_id, leccion_id, completado)
      SELECT ?, l.id, true FROM mentorias.leccion l JOIN mentorias.modulo m ON m.id = l.modulo_id WHERE l.curso_id = ? ORDER BY m.orden, l.orden LIMIT 2`, insc.id, ids.erp);
    await ejecutar(`INSERT INTO mentorias.inscripcion (usuario_id, usuario_nombre, organizacion_id, curso_id, grupo_id, estado, origen)
      VALUES (?, ?, ?, ?, ?, 'activa', 'institucion_propia')`, emprendedor.id, emprendedor.nombre_completo, INST_SAN_JOSE, ids.local, ids.local_grupo);
  }
  console.log(`[demo] Mentorías: ${cursos.length} cursos de ejemplo creados`);
}

// ═══════════════════════════════ ERP ═══════════════════════════════

async function sembrarErp() {
  const yo = await idDe('emprendedor@pymedu.com');
  if (!yo) return;
  // Flags del plan Pro para la cuenta demo (idempotente).
  await ejecutar(`UPDATE perfiles SET membresia_nivel = 'pro', puede_ver_caja = 1, puede_ver_reportes = 1,
    puede_crear_ventas = 1, puede_crear_gastos = 1 WHERE id = ?`, yo.id);
  if ((await uno('SELECT count(*)::int AS n FROM erp_datos WHERE usuario_id = ?', yo.id)).n > 0) return;
  await ejecutar(`UPDATE perfiles SET negocio_nombre = COALESCE(negocio_nombre, 'Almacén y Perfumería Demo'), negocio_rut = COALESCE(negocio_rut, '76.987.654-3'),
    negocio_rubro = COALESCE(negocio_rubro, 'Comercio minorista') WHERE id = ?`, yo.id);

  const r = azar(2026);
  const elegir = (lista) => lista[Math.floor(r() * lista.length)];
  const filas = [];
  const agregar = (coleccion, obj) => { filas.push([coleccion, obj.id, obj]); return obj; };

  const catalogo = [
    ['Café grano 1 kg', 'Abarrotes', 8900, 14990], ['Té verde 100 u', 'Abarrotes', 2900, 4990], ['Aceite oliva 1 l', 'Abarrotes', 6500, 9990],
    ['Miel nativa 500 g', 'Abarrotes', 4200, 7490], ['Galletas artesanales', 'Panadería', 1500, 2990], ['Pan amasado docena', 'Panadería', 1800, 3500],
    ['Jabón natural', 'Cuidado personal', 1900, 3990], ['Crema de manos', 'Cuidado personal', 3100, 5990], ['Vela aromática', 'Hogar', 2600, 5490],
    ['Detergente 3 l', 'Hogar', 4300, 6990], ['Atomizador 5 ml', 'Insumos', 250, 0], ['Bolsa reutilizable', 'Hogar', 600, 1500],
  ];
  const productos = catalogo.map(([nombre, categoria, costo, precio], i) => agregar('inventario', {
    id: randomUUID(), nombre, codigo: `P-${String(i + 1).padStart(3, '0')}`, categoria, tipo: 'producto', costo, precio,
    incluyeIva: true, stock: 40 + Math.floor(r() * 160), stockMinimo: 15, unidadMedida: 'unidad', unidadBase: 'unidad',
    estado: 'activo', esInventariable: true, tipoOperativo: precio === 0 ? 'insumo' : 'producto_simple',
  }));
  // Productos fraccionables (ejemplos del documento: perfume en decants y papas por saco/kilo).
  const atomizador = productos[10];
  const perfume = agregar('inventario', {
    id: randomUUID(), nombre: 'Perfume Oud', codigo: 'P-PERF', categoria: 'Perfumería', tipo: 'producto', costo: 600, precio: 89990, incluyeIva: true,
    stock: 300, stockMinimo: 50, unidadMedida: 'ml', unidadBase: 'ml', estado: 'activo', esInventariable: true, controlEnvases: true, capacidadEnvase: 100,
    presentaciones: [
      { id: randomUUID(), nombre: 'Frasco 100 ml', factor: 100, precio: 89990, origen: 'envase_cerrado', activa: true },
      { id: randomUUID(), nombre: 'Decant 5 ml', factor: 5, precio: 6000, origen: 'envase_abierto', activa: true, receta: [{ productoId: atomizador.id, cantidad: 1 }] },
    ],
  });
  const papas = agregar('inventario', {
    id: randomUUID(), nombre: 'Papas', codigo: 'P-PAPA', categoria: 'Verdulería', tipo: 'producto', costo: 400, precio: 900, incluyeIva: true,
    stock: 1000, stockMinimo: 100, unidadMedida: 'kg', unidadBase: 'kg', estado: 'activo', esInventariable: true, controlEnvases: false,
    presentaciones: [
      { id: randomUUID(), nombre: 'Saco 25 kg', factor: 25, precio: 15000, origen: 'granel', activa: true },
      { id: randomUUID(), nombre: 'Kilo suelto', factor: 1, precio: 900, origen: 'granel', activa: true },
    ],
  });
  const hoy = new Date();
  const loteDe = (p, cantidad, costo, dias) => agregar('lotes', {
    id: randomUUID(), productoId: p.id, fecha: iso(masDias(hoy, -dias)), cantidadInicial: cantidad, cantidadRestante: cantidad, costoUnitario: costo,
  });
  productos.forEach((p) => loteDe(p, p.stock, p.costo, 170));
  const lotePerfume = loteDe(perfume, 300, 600, 20);
  loteDe(papas, 1000, 400, 6);
  for (let i = 1; i <= 3; i++) {
    agregar('envases', { id: randomUUID(), productoId: perfume.id, loteId: lotePerfume.id, codigo: `F${i}`, capacidad: 100, restante: 100, estado: 'cerrado' });
  }

  const nombres = ['Comercial Las Rosas', 'María González', 'Juan Pérez', 'Café del Barrio', 'Restaurante El Puerto', 'Ana Torres', 'Minimarket Don Pepe',
    'Pedro Rojas', 'Hostal Andino', 'Camila Fuentes', 'Sociedad Gourmet SpA', 'Luis Herrera'];
  const clientes = nombres.map((nombre, i) => agregar('clientes', {
    id: randomUUID(), nombre, rut: i % 3 === 0 ? `7${6 + (i % 3)}.${100 + i * 7}.${300 + i * 11}-${i % 10}` : '', telefono: `+56 9 ${5000 + i * 137} ${1000 + i * 53}`,
    email: `${nombre.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '').slice(0, 10)}@correo.cl`, ventas: 0, deuda: 0,
  }));
  const proveedores = [['Distribuidora Central', 'Mercadería'], ['Inmobiliaria Plaza', 'Arriendo'], ['Enel Distribución', 'Servicios básicos'],
    ['Imprenta Rápida', 'Marketing'], ['Transportes Sur', 'Transporte'], ['Perfumes Importados Ltda.', 'Mercadería']]
    .map(([nombre, categoria]) => agregar('proveedores', { id: randomUUID(), nombre, categoria, telefono: '+56 2 2345 6789', deuda: 0, condicion_pago: '30 días' }));

  let folioB = 1200;
  let folioF = 340;
  let folioC = 80;
  const documento = (tipo, operacion, fecha, total, extra) => {
    const neto = Math.round(total / 1.19);
    const folio = tipo === 'factura_electronica' ? (operacion === 'venta' ? `F-${++folioF}` : `C-${++folioC}`) : `B-${++folioB}`;
    return agregar('documentosTributarios', {
      id: randomUUID(), operacion, folioInterno: folio, tipoDocumento: tipo, estado: 'emitido_interno', neto, iva: total - neto, exento: 0, total,
      periodoTributario: fecha.slice(0, 7), modoIntegracion: 'sandbox', createdAt: `${fecha}T12:00:00.000Z`, ...extra,
    });
  };

  const metodos = ['efectivo', 'debito', 'credito', 'transferencia'];
  for (let d = 182; d >= 0; d--) {
    const fecha = masDias(hoy, -d);
    const f = iso(fecha);
    // Más ventas los fines de semana y en los meses recientes.
    const n = Math.round((fecha.getDay() === 0 || fecha.getDay() === 6 ? 2.4 : 1.3) * (1 + (182 - d) / 260) * (0.4 + r()));
    for (let k = 0; k < n; k++) {
      const cliente = r() < 0.35 ? null : elegir(clientes);
      const items = Array.from({ length: 1 + Math.floor(r() * 3) }, () => {
        const p = elegir(productos.filter((x) => x.precio > 0));
        const cantidad = 1 + Math.floor(r() * 3);
        const total = p.precio * cantidad;
        const neto = Math.round(total / 1.19);
        return { productoId: p.id, productoNombre: p.nombre, esInventariable: true, cantidad, precioBase: p.precio, costoUnitario: p.costo, costoVenta: p.costo * cantidad,
          categoria: p.categoria, descuentoTipo: 'ninguno', subtotal: neto, iva: total - neto, total };
      });
      const monto = items.reduce((a, it) => a + it.total, 0);
      const pendiente = cliente && r() < 0.16;
      const parcial = pendiente && r() < 0.4 ? Math.round(monto * 0.4) : 0;
      const saldo = pendiente ? monto - parcial : 0;
      const tipo = cliente?.rut ? 'factura_electronica' : 'boleta_electronica';
      const id = randomUUID();
      const doc = documento(tipo, 'venta', f, monto, { ventaId: id, clienteId: cliente?.id });
      const metodo = elegir(metodos);
      agregar('ventas', {
        id, fecha: f, cliente: cliente?.nombre ?? 'Cliente general', cliente_id: cliente?.id, productos: items, subtotal: doc.neto, iva: doc.iva, monto,
        estado: pendiente ? 'Pendiente' : 'Pagado', tipo_documento: tipo, documento_id: doc.id, periodo_tributario: f.slice(0, 7), modo_integracion: 'sandbox',
        estado_documento: 'emitido_interno', metodo_pago: metodo, saldo_base: saldo, saldo_pendiente: saldo, propina: 0,
        fecha_vencimiento: pendiente ? iso(masDias(fecha, 30)) : undefined, creado_por_id: yo.id, creado_por: yo.nombre_completo,
      });
      if (cliente) { cliente.ventas += 1; cliente.deuda += saldo; }
      if (monto - saldo > 0) {
        agregar('movimientos', { id: randomUUID(), fecha: f, tipo: 'Ingreso', concepto: `Venta — ${cliente?.nombre ?? 'Cliente general'}`, monto: monto - saldo, saldo: 0, metodo_pago: metodo, referencia_id: id });
      }
      // Cobro parcial posterior en algunas ventas pendientes antiguas.
      if (pendiente && d > 40 && r() < 0.5) {
        const abono = Math.round(saldo / 2);
        const fAbono = iso(masDias(fecha, 15));
        agregar('abonos', { id: randomUUID(), referencia_id: id, tipo: 'cobro', monto: abono, monto_abono: abono, metodo_pago: 'transferencia', fecha: fAbono, cliente_proveedor: cliente.nombre, origen: 'manual' });
        agregar('movimientos', { id: randomUUID(), fecha: fAbono, tipo: 'Ingreso', concepto: `Cobro a ${cliente.nombre}`, monto: abono, saldo: 0, metodo_pago: 'transferencia', referencia_id: id });
        cliente.deuda -= abono;
      }
    }
  }

  // Gastos: arriendo y luz mensuales + compras de mercadería y otros.
  const gasto = (fecha, prov, categoria, monto, porPagar) => {
    const id = randomUUID();
    const esFactura = categoria !== 'Arriendo';
    const doc = documento(esFactura ? 'factura_electronica' : 'boleta_electronica', 'compra', fecha, monto, { gastoId: id, proveedorId: prov.id });
    agregar('gastos', {
      id, fecha, proveedor: prov.nombre, proveedor_id: prov.id, categoria, subtotal: doc.neto, iva: esFactura ? doc.iva : 0, monto, esFactura,
      documento_id: doc.id, periodo_tributario: fecha.slice(0, 7), tipo_documento_compra: doc.tipoDocumento,
      estado: porPagar ? 'Por Pagar' : 'Pagado', metodo_pago: 'transferencia', saldo_base: porPagar ? monto : 0, saldo_pendiente: porPagar ? monto : 0,
      fecha_vencimiento: porPagar ? iso(masDias(new Date(`${fecha}T12:00:00`), 30)) : undefined,
    });
    if (porPagar) prov.deuda += monto;
    else agregar('movimientos', { id: randomUUID(), fecha, tipo: 'Egreso', concepto: `Gasto ${prov.nombre}`, monto, saldo: 0, metodo_pago: 'transferencia', referencia_id: id });
  };
  for (let m = 5; m >= 0; m--) {
    const base = new Date(hoy.getFullYear(), hoy.getMonth() - m, 5);
    gasto(iso(base), proveedores[1], 'Arriendo', 650000, m === 0);
    gasto(iso(masDias(base, 3)), proveedores[2], 'Servicios básicos', 70000 + Math.round(r() * 30000), false);
    for (let k = 0; k < 4; k++) {
      const fecha = masDias(base, 2 + Math.floor(r() * 24));
      if (fecha > hoy) continue;
      const prov = elegir([proveedores[0], proveedores[0], proveedores[3], proveedores[4], proveedores[5]]);
      // Algunas compras a crédito ya vencidas (corrección #15: deben verse como atrasadas).
      gasto(iso(fecha), prov, prov.categoria, 80000 + Math.round(r() * 420000), m <= 2 && r() < 0.3);
    }
  }

  agregar('config', { id: 'config', modoIntegracion: 'sandbox', ambiente: 'sandbox', ppmTasa: 1, usaFoliosManual: true, metodoCosteo: 'promedio', metaMensual: 0 });

  for (let i = 0; i < filas.length; i += 200) {
    const lote = filas.slice(i, i + 200);
    await ejecutar(`INSERT INTO erp_datos (usuario_id, coleccion, id, data) VALUES ${lote.map(() => '(?, ?, ?, ?::jsonb)').join(', ')}
      ON CONFLICT DO NOTHING`, ...lote.flatMap(([col, id, obj]) => [yo.id, col, id, JSON.stringify(obj)]));
  }
  console.log(`[demo] ERP: ${filas.length} registros de ejemplo para ${yo.nombre_completo}`);
}
