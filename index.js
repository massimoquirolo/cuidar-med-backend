// --- 1. IMPORTACIONES ---
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const Medicamento = require('./models/Medicamento');
const Historial = require('./models/Historial');
const { ejecutarDescuentoStock } = require('./worker.js');
const { enviarMensajeTelegram } = require('./telegramHelper.js');

// --- 2. CONFIGURACIÓN INICIAL ---
const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

// --- 3. MIDDLEWARES ---
app.use(express.json());
// Configuración de CORS específica para tu app de Vercel
const corsOptions = {
  origin: 'https://cuidar-med-frontend.vercel.app'
};
app.use(cors(corsOptions));


// --- 4. MIDDLEWARE DE AUTENTICACIÓN (El "Guardia") ---
const authenticateToken = (req, res, next) => {
  // Buscamos el "pase" en los headers de la petición
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Formato "Bearer TOKEN"

  if (token == null) {
    // No hay pase, lo rechazamos
    return res.status(401).json({ mensaje: "No autorizado (Token no provisto)" });
  }

  // Verificamos si el pase es válido
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      // El pase es falso o expiró, lo rechazamos
      return res.status(403).json({ mensaje: "Token inválido" });
    }
    
    // El pase es válido, dejamos que la petición continúe
    req.user = user;
    next();
  });
};


// --- 5. DEFINICIÓN DE RUTAS DE LA API ---

// Ruta Raíz
app.get('/', (req, res) => {
  res.send('¡El cerebro de CuidarMed (Versión Personal) está funcionando y conectado a la BD!');
});

// --- RUTA DE LOGIN (PÚBLICA) ---
// [MODIFICADA] Ruta de Login
app.post('/api/login', (req, res) => {
  // 1. Buscamos la contraseña Y la nueva opción "recordarme"
  const { password, recordarme } = req.body;

  // 2. Comparamos la contraseña enviada con nuestro secreto
  if (password !== process.env.APP_SECRET_PASSWORD) {
    return res.status(401).json({ mensaje: "Contraseña incorrecta" });
  }

  // 3. La contraseña es correcta: Creamos un "pase" (JWT)
  // ¡AQUÍ ESTÁ LA NUEVA LÓGICA!
  // Si "recordarme" es true, el pase dura 30 días.
  // Si no, dura 8 horas.
  const expiresIn = recordarme ? '30d' : '8h';

  const token = jwt.sign(
    { user: "admin" }, 
    process.env.JWT_SECRET, 
    { expiresIn: expiresIn } // Usamos la nueva duración
  );

  // 4. Enviamos el pase al frontend
  res.json({ token: token });
});


// --- RUTAS DE CRON JOBS (PROTEGIDAS POR SECRETO) ---
app.get('/api/trigger-worker', (req, res) => {
  const { secret } = req.query; 

  if (secret !== process.env.CRON_SECRET) {
    console.log('Intento de ejecución de worker RECHAZADO (secreto incorrecto)');
    return res.status(401).send('No autorizado');
  }

  console.log('Intento de ejecución de worker ACEPTADO.');
  res.status(200).send('Tarea de descuento iniciada. (La tarea corre en segundo plano)');
  
  ejecutarDescuentoStock();
});

app.get('/api/reporte-diario', (req, res) => {
  const { secret } = req.query;

  if (secret !== process.env.CRON_SECRET) {
    console.log('Intento de REPORTE RECHAZADO (secreto incorrecto)');
    return res.status(401).send('No autorizado');
  }

  console.log('Intento de REPORTE ACEPTADO.');
  res.status(200).send('Reporte diario iniciado. (La tarea corre en segundo plano)');

  const generarYEnviarReporte = async () => {
    try {
      const meds = await Medicamento.find().sort({ nombre: 1 }).lean();
      
      let mensaje = "<b>☀️ Reporte de Inventario Periódico ☀️</b>\n\n";
      let hayAlertas = false;
      
      const hoy = new Date();
      const fechaLimite = new Date();
      fechaLimite.setDate(hoy.getDate() + 30);
      
      for (const med of meds) {
        // Calculamos dias restantes aquí también
        let diasRestantes = 0;
        if (med.horarios && med.horarios.length > 0) {
          diasRestantes = Math.floor(med.stockActual / med.horarios.length);
        }

        mensaje += `<b>${med.nombre}</b>: ${diasRestantes} días (Stock: ${med.stockActual})\n`;
        
        if (med.stockActual <= med.stockMinimo) {
          mensaje += `  <pre>⚠️ ¡STOCK BAJO!</pre>\n`;
          hayAlertas = true;
        }
        if (med.fechaVencimiento) {
          const fechaVenc = new Date(med.fechaVencimiento);
          if (fechaVenc <= fechaLimite) {
            mensaje += `  <pre>🗓️ ¡VENCE PRONTO! (${fechaVenc.toLocaleDateString('es-AR')})</pre>\n`;
            hayAlertas = true;
          }
        }
      }
      
      if (!hayAlertas) {
        mensaje += "\nTodo en orden. ¡Buen reporte! 👍";
      }
      
      await enviarMensajeTelegram(mensaje);
      
    } catch (error) {
      console.error("Error al generar el reporte diario:", error);
    }
  };
  
  generarYEnviarReporte();
});


// --- RUTAS PROTEGIDAS (Requieren 'authenticateToken') ---

app.get('/api/medicamentos', authenticateToken, async (req, res) => {
  try {
    const medicamentos = await Medicamento.find().lean(); 
    const medicamentosConCalculo = medicamentos.map(med => {
      let diasRestantes = 0;
      if (med.horarios && med.horarios.length > 0) {
        diasRestantes = Math.floor(med.stockActual / med.horarios.length);
      }
      return {
        ...med,
        diasRestantes: diasRestantes
      };
    });
    res.json(medicamentosConCalculo);
  } catch (error) {
    console.error('ERROR en GET /api/medicamentos:', error);
    res.status(500).json({ mensaje: "Error al obtener medicamentos", error });
  }
});

app.get('/api/historial', authenticateToken, async (req, res) => {
  try {
    const historial = await Historial.find().sort({ fecha: -1 }).limit(50);
    res.json(historial);
  } catch (error) {
    console.error('ERROR en GET /api/historial:', error);
    res.status(500).json({ mensaje: "Error al obtener historial", error });
  }
});

app.post('/api/medicamentos', authenticateToken, async (req, res) => {
  try {
    const nuevoMed = new Medicamento(req.body);
    const medicamentoGuardado = await nuevoMed.save();

    if (medicamentoGuardado.stockActual > 0) {
      await Historial.create({
        medicamentoNombre: medicamentoGuardado.nombre,
        movimiento: medicamentoGuardado.stockActual,
        tipo: 'Carga Inicial'
      });
    }
    
    res.status(201).json(medicamentoGuardado);
  } catch (error) {
    console.error('ERROR en POST /api/medicamentos:', error);
    res.status(400).json({ mensaje: "Error al guardar el medicamento", error });
  }
});

app.put('/api/medicamentos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const datosActualizados = req.body;

    const medViejo = await Medicamento.findById(id);
    if (!medViejo) {
      return res.status(404).json({ mensaje: "Medicamento no encontrado" });
    }

    const fechaVieja = medViejo.fechaVencimiento ? medViejo.fechaVencimiento.toISOString() : null;
    const fechaNueva = datosActualizados.fechaVencimiento ? datosActualizados.fechaVencimiento : null;

    if (fechaNueva !== fechaVieja) {
      datosActualizados.avisoVencimientoEnviado = false;
    }

    const medicamentoActualizado = await Medicamento.findByIdAndUpdate(
      id, 
      datosActualizados, 
      { new: true, runValidators: true }
    );

    const stockViejo = medViejo.stockActual;
    const stockNuevo = medicamentoActualizado.stockActual;

    if (stockViejo !== stockNuevo) {
      const movimiento = stockNuevo - stockViejo;
      
      await Historial.create({
        medicamentoNombre: medicamentoActualizado.nombre,
        movimiento: movimiento,
        tipo: 'Ajuste Manual'
      });
      
      if (stockNuevo > medViejo.stockMinimo) {
         medicamentoActualizado.avisoStockEnviado = false;
         await medicamentoActualizado.save();
      }
    }

    res.json(medicamentoActualizado);

  } catch (error) {
    console.error('ERROR en PUT /api/medicamentos/:id:', error);
    res.status(400).json({ mensaje: "Error al actualizar el medicamento", error });
  }
});

app.delete('/api/medicamentos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const medicamentoEliminado = await Medicamento.findByIdAndDelete(id);

    if (!medicamentoEliminado) {
      return res.status(404).json({ mensaje: "Medicamento no encontrado para eliminar" });
    }
    
    res.json({ mensaje: "Medicamento eliminado exitosamente" });

  } catch (error) {
    console.error('ERROR en DELETE /api/medicamentos/:id:', error);
    res.status(500).json({ mensaje: "Error al eliminar el medicamento", error });
  }
});

app.put('/api/medicamentos/:id/recargar', authenticateToken, async (req, res) => {
    try {
        const { cantidad } = req.body; 
        const { id } = req.params;
        const medicamento = await Medicamento.findById(id);

        if (!medicamento) {
            return res.status(404).json({ mensaje: "Medicamento no encontrado" });
        }

        medicamento.stockActual += cantidad; 
        medicamento.avisoStockEnviado = false; // Reseteamos el flag de aviso
        const medicamentoActualizado = await medicamento.save();
        
        // Registramos la recarga en el historial
        await Historial.create({
          medicamentoNombre: medicamentoActualizado.nombre,
          movimiento: cantidad,
          tipo: 'Recarga'
        });

        console.log(`STOCK RECARGADO: ${medicamento.nombre} ahora tiene ${medicamento.stockActual} unidades.`);
        res.json(medicamentoActualizado);

    } catch (error) {
        console.error('ERROR en PUT .../recargar:', error);
        res.status(500).json({ mensaje: "Error al recargar stock", error });
    }
});


// --- 6. CONEXIÓN A LA BASE DE DATOS ---
(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('¡Conectado exitosamente a MongoDB Atlas! 🚀');

    app.listen(PORT, () => {
      console.log(`Servidor escuchando en http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('Error al conectar a MongoDB:', error);
    process.exit(1);
  }
})();