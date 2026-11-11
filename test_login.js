import('./server/src/db.js').then(async (dbModule) => {
  const db = dbModule.default || dbModule;
  await db.inicializar();
  
  // Test: check if user with inicial.apellido@pymedu.cl exists
  console.log('=== Buscando usuario con formato inicial.apellido@pymedu.cl ===');
  
  try {
    const testEmails = [
      'u.apellido@pymedu.cl',
      'a.perez@pymedu.cl', 
      'j.garcia@pymedu.cl'
    ];
    
    for (const email of testEmails) {
      const result = await db.conectar().query('SELECT id, email, nombre_completo, rol FROM perfiles WHERE email = ?', [email]);
      console.log(`Email ${email}:`, result.rows.length > 0 ? 'EXISTE' : 'NO EXISTE');
      if (result.rows.length > 0) {
        console.log('  Datos:', result.rows[0]);
      }
    }
    
    // Try login with one of the existing users
    console.log('\n=== Probando login con admin@colegiosanjose.cl ===');
    const result = await db.conectar().query('SELECT * FROM perfiles WHERE email = ?', ['admin@colegiosanjose.cl']);
    if (result.rows.length > 0) {
      const bcrypt = await import('bcrypt');
      const pwCompare = bcrypt.compareSync('Demo#2026', result.rows[0].password_hash);
      console.log('Contraseña correcta:', pwCompare);
      console.log('Perfil:', result.rows[0].nombre_completo, '- Rol:', result.rows[0].rol);
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}).catch(e => console.error('Error fatal:', e));