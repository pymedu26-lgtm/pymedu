import('./server/src/db.js').then(async (db) => {
  await db.inicializar();
  const r = await db.conectar().query('SELECT id, email, nombre_completo, rol FROM perfiles');
  console.log('Usuarios en la base de datos:');
  r.rows.forEach(x => console.log({id: x.id, email: x.email, nombre: x.nombre_completo, rol: x.rol}));
}).catch(e => console.error('Error:', e));