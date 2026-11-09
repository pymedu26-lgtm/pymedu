import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import net from 'net';
import { spawn, type ChildProcess } from 'child_process';
import { defineConfig, type Plugin } from 'vite';

const PUERTO_API = 4000;

// Levanta y detiene el servidor API junto con `npm run dev`
function servidorApi(): Plugin {
  let proceso: ChildProcess | null = null;

  const puertoOcupado = () =>
    new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(800);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
      socket.once('error', () => resolve(false));
      socket.connect(PUERTO_API, '127.0.0.1');
    });

  return {
    name: 'pymedu-servidor-api',
    async configureServer() {
      if (await puertoOcupado()) {
        console.log(`[api] Puerto ${PUERTO_API} ya en uso: se asume que la API ya esta corriendo.`);
        return;
      }
      console.log(`[api] Iniciando servidor API en http://localhost:${PUERTO_API} ...`);
      proceso = spawn(process.execPath, ['--watch', 'src/index.js'], {
        cwd: path.resolve(__dirname, 'server'),
        // PORT fijo: si el entorno trae PORT=3000 (el del frontend) la API chocaría con Vite.
        env: { ...process.env, PORT: String(PUERTO_API) },
        stdio: 'inherit',
      });

      const cerrar = () => { try { proceso?.kill(); } catch { /* noop */ } };
      process.once('exit', cerrar);
      process.once('SIGINT', () => { cerrar(); process.exit(0); });
      process.once('SIGTERM', () => { cerrar(); process.exit(0); });

      proceso.on('exit', (code) => console.log(`[api] Servidor API detenido (codigo ${code}).`));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), servidorApi()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${PUERTO_API}`,
        changeOrigin: true,
      },
    },
  },
});
