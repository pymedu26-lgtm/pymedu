#!/bin/bash
# ============================================
# PymEdu - Script de Inicio
# ============================================

echo "🚀 Iniciando PymEdu..."

# Instalar dependencias del servidor si es necesario
if [ ! -d "node_modules" ]; then
  echo "📥 Instalando dependencias..."
  npm install
fi

# Iniciar servidor API en background
echo "🔧 Iniciando servidor API..."
npm run server &
SERVER_PID=$!

# Esperar a que el servidor esté listo
sleep 3

echo ""
echo "============================================"
echo "  ✅ PymEdu está ejecutándose!"
echo "============================================"
echo ""
echo "  Frontend:  http://localhost:3000"
echo "  API:       http://localhost:4000"
echo ""
echo "  Base de datos: PostgreSQL en Railway"
echo "  (configura DATABASE_URL y JWT_SECRET en .env)"
echo ""
echo "  Cuentas demo:"
echo "    - supadmin@pymedu.com / Demo#2026"
echo "    - admin@colegiosanjose.cl / Demo#2026"
echo "    - coord@colegiosanjose.cl / Demo#2026"
echo "    - mentor@colegiosanjose.cl / Demo#2026"
echo "    - emprendedor@pymedu.com / Demo#2026"
echo ""
echo "  Presiona Ctrl+C para detener todo"
echo "============================================"

# Manejar señal de interrupción
trap "echo '🛑 Deteniendo servicios...'; kill $SERVER_PID; exit 0" INT TERM

# Mantener el script ejecutándose
wait
