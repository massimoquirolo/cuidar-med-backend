// index.js

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
// Importamos el validador
const { validarMedicamento } = require('./validations');

// --- 2. CONFIGURACIÓN INICIAL ---
const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

// --- 3. MIDDLEWARES ---
app.use(express.json());
// Configuración de CORS
const corsOptions = {
  origin: ['https://cuidar-med-frontend.vercel.app', 'http://localhost:5173']
};
app.use(cors(corsOptions));


// --- 4. MIDDLEWARE DE AUTENTICACIÓN (El "Guardia") ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.status(401).json({ mensaje: "No autorizado (Token no provisto)" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ mensaje: "Token inválido o expirado" });
    }
    req.user = user;
    next();
  });
};


// --- 5. DEFINICIÓN DE RUTAS DE LA API ---

// Ruta Raíz
app.get('/', (req, res) => {
  res.send('¡El cerebro de CuidarMed (Versión Segura) está funcionando!');
});

// --- RUTA DE LOGIN (PÚBLICA) ---
app.post('/api/login', (req, res) => {
  // CORREGIDO AQUÍ: Se eliminó el 'ZS' que se había colado
  const { password, recordarme } = req.body;

  if (password !== process.env.APP_SECRET_PASSWORD) {
    return res.status(401).json({ mensaje: "Contraseña incorrecta" });
  }

  const expiresIn = recordarme ? '30d' : '8h';

  const token = jwt.sign(
    { user: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: expiresIn }
  );

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
  // Respondemos rápido a Vercel Cron para evitar timeouts
  res.status(200).send('Tarea de descuento iniciada en segundo plano.');

  // Ejecutamos la tarea sin esperar (fire-and-forget para la respuesta HTTP)
  ejecutarDescuentoStock();
});

app.get('/api/reporte-diario', (req, res) => {
  const { secret } = req.query;

  if (secret !== process.env.CRON_SECRET) {
    console.log('Intento de REPORTE RECHAZADO (secreto incorrecto)');
    return res.status(401).send('No autorizado');
  }

  console.log('Intento de REPORTE ACEPTADO.');
  res.status(200).send('Reporte diario iniciado en segundo plano.');

  const generarYEnviarReporte = async () => {
    try {
      const meds = await Medicamento.find().sort({ nombre: 1 }).lean();

      let mensaje = "<b>☀️ Reporte de Inventario Periódico ☀️</b>\n\n";
      let hayAlertas = false;

      const hoy = new Date();
      const fechaLimite = new Date();
      fechaLimite.setDate(hoy.getDate() + 30);

      for (const med of meds) {
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

// [USO DEL VALIDADOR]
app.post('/api/medicamentos', authenticateToken, validarMedicamento, async (req, res) => {
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
    res.status(500).json({ mensaje: "Error interno al guardar el medicamento", error });
  }
});

// [USO DEL VALIDADOR]
app.put('/api/medicamentos/:id', authenticateToken, validarMedicamento, async (req, res) => {
  try {
    const { id } = req.params;
    const datosActualizados = req.body;

    const medViejo = await Medicamento.findById(id);
    if (!medViejo) {
      return res.status(404).json({ mensaje: "Medicamento no encontrado" });
    }

    const fechaVieja = medViejo.fechaVencimiento ? new Date(medViejo.fechaVencimiento).toISOString() : null;
    const fechaNueva = datosActualizados.fechaVencimiento ? new Date(datosActualizados.fechaVencimiento).toISOString() : null;

    if (fechaNueva !== fechaVieja) {
      datosActualizados.avisoVencimientoEnviado = false;
    }

    const medicamentoActualizado = await Medicamento.findByIdAndUpdate(
      id,
      datosActualizados,
      { new: true }
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
    res.status(500).json({ mensaje: "Error interno al actualizar", error });
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
        if (!cantidad || isNaN(cantidad) ||Number(cantidad) <= 0) {
             return res.status(400).json({ mensaje: "La cantidad a recargar debe ser un número positivo." });
        }

        const { id } = req.params;
        const medicamento = await Medicamento.findById(id);

        if (!medicamento) {
            return res.status(404).json({ mensaje: "Medicamento no encontrado" });
        }

        medicamento.stockActual += Number(cantidad);
        medicamento.avisoStockEnviado = false;
        const medicamentoActualizado = await medicamento.save();

        await Historial.create({
          medicamentoNombre: medicamentoActualizado.nombre,
          movimiento: Number(cantidad),
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