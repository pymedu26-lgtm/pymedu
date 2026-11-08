// Capturas responsive del ERP (Playwright) a 390×844 (teléfono) y 820×1180 (tablet).
// Uso: con la app corriendo (`npm run dev`), ejecutar `npm run capturas`.
// Variables opcionales:
//   BASE_URL (por defecto http://localhost:3000)
//   PYMEDU_EMAIL / PYMEDU_PASSWORD (por defecto, la cuenta demo del seed local server/src/seeds)
//   CHROMIUM_PATH (un Chrome/Chromium ya instalado; si no, el de `npx playwright install chromium`)
// No confirma ventas ni guarda productos: solo navega, llena el carrito y fotografía.
// Además avisa si alguna pantalla tiene scroll horizontal.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const EMAIL = process.env.PYMEDU_EMAIL ?? 'emprendedor@pymedu.com';
const CLAVE = process.env.PYMEDU_PASSWORD ?? 'Demo#2026';
const SALIDA = path.resolve('capturas-responsive');
const VISTAS = [
  { nombre: 'telefono-390x844', viewport: { width: 390, height: 844 }, movil: true },
  { nombre: 'tablet-820x1180', viewport: { width: 820, height: 1180 }, movil: false },
];

const problemas = [];
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

async function revisarDesborde(page, vista, pantalla) {
  const { ancho, contenido } = await page.evaluate(() => ({ ancho: window.innerWidth, contenido: document.documentElement.scrollWidth }));
  if (contenido > ancho + 1) problemas.push(`${vista} · ${pantalla}: scroll horizontal (${contenido}px > ${ancho}px)`);
}

async function foto(page, vista, nombre, completa = true) {
  await esperar(500);
  await revisarDesborde(page, vista, nombre);
  const archivo = path.join(SALIDA, `${vista}__${nombre}.png`);
  await page.screenshot({ path: archivo, fullPage: completa });
  console.log('  ✓', path.relative(process.cwd(), archivo));
}

async function entrar(page) {
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder('tu@negocio.com').fill(EMAIL);
  await page.locator('input[type="password"]').fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/erp\//, { timeout: 20000 });
}

async function ir(page, ruta) {
  await page.goto(`${BASE}${ruta}`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await esperar(1200);
}

async function principal() {
  await mkdir(SALIDA, { recursive: true });
  const navegador = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const v of VISTAS) {
    console.log(`\n${v.nombre}`);
    const contexto = await navegador.newContext({
      viewport: v.viewport, deviceScaleFactor: 2, isMobile: v.movil, hasTouch: v.movil, locale: 'es-CL', colorScheme: 'light',
    });
    const page = await contexto.newPage();
    await entrar(page);

    // Panel general
    await ir(page, '/erp/inicio');
    await foto(page, v.nombre, '01-dashboard');

    // Menú (cajón) en teléfono y tablet
    const hamburguesa = page.getByRole('button', { name: 'Abrir menú' });
    if (await hamburguesa.isVisible().catch(() => false)) {
      await hamburguesa.click();
      await foto(page, v.nombre, '02-menu-cajon', false);
      await page.mouse.click(v.viewport.width - 20, v.viewport.height / 2);
    }

    // Inventario: lista y ficha
    await ir(page, '/erp/inventario');
    await foto(page, v.nombre, '03-inventario-lista');
    await page.getByText('Lattafa Asad', { exact: true }).last().click(); // la primera puede estar en un gráfico
    await page.getByRole('dialog').waitFor();
    await foto(page, v.nombre, '04-inventario-ficha', false);
    await page.getByRole('button', { name: 'Cerrar' }).first().click();

    // Registro de producto con sugerencias
    await page.getByRole('button', { name: 'Nuevo Producto' }).click();
    await page.getByRole('radio', { name: /Botella o frasco/ }).click();
    await page.getByPlaceholder('Perfumería, Verdulería…').fill('Perfumería');
    await page.locator('#rp-contenido').fill('50');
    await page.getByText('Sugerencias', { exact: true }).scrollIntoViewIfNeeded();
    await foto(page, v.nombre, '05-registro-sugerencias', false);
    await page.getByRole('button', { name: /Decant 5 ml/ }).first().click();
    await page.getByText('Sugerencias', { exact: true }).scrollIntoViewIfNeeded().catch(() => {});
    await foto(page, v.nombre, '06-registro-subcategoria-agregada', false);
    await page.getByRole('button', { name: 'Cancelar' }).last().click();

    // Ventas: decant y venta por peso en el carrito (sin confirmar)
    await ir(page, '/erp/ventas');
    await page.getByRole('button', { name: 'Nueva Venta' }).click();
    const buscador = page.getByLabel('Buscar producto o subcategoría');
    await buscador.fill('asad');
    await page.getByRole('button', { name: /Lattafa Asad · Decant 5 ml/ }).click();
    await foto(page, v.nombre, '07-venta-decant', false);
    await page.getByRole('button', { name: /Agregar$/ }).click();
    await buscador.fill('tomate');
    await page.getByRole('button', { name: /Tomate · Por kilo/ }).click();
    await page.locator('#venta-peso').fill('1,37');
    await foto(page, v.nombre, '08-venta-peso', false);
    await page.getByRole('button', { name: /Agregar$/ }).click();
    const cobrar = page.getByRole('button', { name: /Cobrar$/ });
    if (await cobrar.isVisible().catch(() => false)) await cobrar.click();
    await foto(page, v.nombre, '09-venta-carrito', false);
    await page.getByRole('button', { name: 'Cerrar' }).first().click();

    // Centro de alertas con la campana abierta
    await ir(page, '/erp/alertas');
    await foto(page, v.nombre, '10-centro-alertas');
    await page.getByRole('button', { name: /^Alertas/ }).click();
    await foto(page, v.nombre, '11-campana-abierta', false);
    await page.keyboard.press('Escape');

    // Configuración (pestañas Inventario y Alertas)
    await ir(page, '/erp/configuracion');
    await foto(page, v.nombre, '12-configuracion');
    await page.getByRole('button', { name: /Alertas/ }).first().click();
    await foto(page, v.nombre, '13-configuracion-alertas');

    await contexto.close();
  }
  await navegador.close();
  console.log(problemas.length ? `\nScroll horizontal detectado:\n- ${problemas.join('\n- ')}` : '\nSin scroll horizontal en ninguna pantalla.');
}

principal().catch(e => { console.error(e); process.exit(1); });
