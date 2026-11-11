import('./server/src/db.js').then(async (dbModule) => {
  const db = dbModule.default ? dbModule.default : dbModule;
  await db.inicializar();
  
  // Add test user with inicial.apellido@pymedu.cl format
  const bcrypt = await import('bcrypt');
  const pw = bcrypt.hashSync('Test1234', 10);
  await db.conectar().query(
    'INSERT INTO perfiles (id, email, password_hash, nombre_completo, rol, institucion_id, activo, membresia_nivel, segmento_negocio) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)',
    ['test-uid-1', 'u.apellido@pymedu.com', pw, 'Usuario Test', 'emprendedor', null]
  );
  console.log('Usuario creado: u.apellido@pymedu.com');
  
  // Test login
  const result = await db.conectar().query('SELECT * FROM perfiles WHERE email = ?', ['u.apellido@pymedu.com']);
  console.log('Usuario encontrado:', result.rows.length > 0 ? 'SÍ' : 'NO');
  if (result.rows.length > 0) {
    const valid = bcrypt.compareSync('Test1234', result.rows[0].password_hash);
    console.log('Contraseña Test1234 correcta:', valid);
    console.log('Perfil completo:', result.rows[0]);
  }
}).catch(e => console.error('Error:', e));