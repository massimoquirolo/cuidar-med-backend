// --- 1. IMPORTACIONES ---
// Forzando una actualización para Render
const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config(); // Carga nuestras variables de entorno (el .env)
const Medicamento = require('./models/Medicamento'); // Importamos nuestro "molde"
const cors = require('cors'); // <--- 1. IMPORTA CORS
const { ejecutarDescuentoStock } = require('./worker.js'); // Importamos la función
const Historial = require('./models/Historial');

// --- 2. CONFIGURACIÓN INICIAL ---
const app = express();
const PORT = process.env.PORT || 3000; // Usa el puerto 3000 o el que esté en .env
const MONGO_URI = process.env.MONGO_URI; // Carga la "llave" de la base de datos

// --- 3. MIDDLEWARES ---
app.use(express.json()); // Para que Express entienda JSON
const corsOptions = {
  origin: 'https://cuidar-med-frontend.vercel.app'
};
app.use(cors(corsOptions));

// --- 4. CONEXIÓN A LA BASE DE DATOS ---
// Esta es una función que se "auto-ejecuta"
(async () => {
  try {
    // Intentamos conectarnos a MongoDB Atlas
    await mongoose.connect(MONGO_URI);
    console.log('¡Conectado exitosamente a MongoDB Atlas! 🚀');

    // ¡IMPORTANTE!
    // Solo si la conexión a la BD es exitosa, ponemos a escuchar al servidor.
    app.listen(PORT, () => {
      console.log(`Servidor escuchando en http://localhost:${PORT}`);
    });

  } catch (error) {
    // Si la conexión falla, lo mostramos en consola y NO arrancamos el servidor.
    console.error('Error al conectar a MongoDB:', error);
    process.exit(1); // Detiene la aplicación
  }
})();


// --- 5. DEFINICIÓN DE RUTAS DE LA API (AHORA CON MONGOOSE) ---

// Ruta Raíz
app.get('/', (req, res) => {
  res.send('¡El cerebro de CuidarMed (Versión Personal) está funcionando y conectado a la BD!');
});

// GET /api/medicamentos - OBTENER todos los medicamentos
// Usamos async/await porque hablar con la BD toma tiempo
app.get('/api/medicamentos', async (req, res) => {
  try {
    const medicamentos = await Medicamento.find(); // .find() busca TODO
    res.json(medicamentos);
  } catch (error) {
    console.error('ERROR en GET /api/medicamentos:', error); // <-- AÑADE ESTA LÍNEA
    res.status(500).json({ mensaje: "Error al obtener medicamentos", error });
  }
});

// POST /api/medicamentos - AGREGAR un nuevo medicamento
app.post('/api/medicamentos', async (req, res) => {
  try {
    // Creamos un nuevo medicamento usando el "molde" y los datos del body
    const nuevoMed = new Medicamento(req.body);
    // Le pedimos a Mongoose que lo guarde en la BD
    const medicamentoGuardado = await nuevoMed.save();
    res.status(201).json(medicamentoGuardado); // 201 = Creado Exitosamente
  } catch (error) {
    console.error('ERROR en GET /api/medicamentos:', error); // <-- AÑADE ESTA LÍNEA
    res.status(400).json({ mensaje: "Error al guardar el medicamento", error });
  }
});

// POST /api/tomas - CONFIRMAR UNA TOMA (Descontar stock)
app.post('/api/tomas', async (req, res) => {
  try {
    const { medicamentoId } = req.body;

    // 1. Buscamos el medicamento en la BD por su ID
    const medicamento = await Medicamento.findById(medicamentoId);

    if (!medicamento) {
      return res.status(404).json({ mensaje: "Medicamento no encontrado" });
    }

    // 2. Verificamos stock
    if (medicamento.stockActual <= 0) {
      return res.status(400).json({ mensaje: "Error: No hay stock de " + medicamento.nombre });
    }

    // 3. Descontamos el stock
    medicamento.stockActual--;

    // 4. [NUEVA LÓGICA DE ALARMA]
    if (medicamento.stockActual <= medicamento.stockMinimo) {
      console.log(`ALERTA DE STOCK BAJO: Quedan ${medicamento.stockActual} unidades de ${medicamento.nombre}`);
      // (Aquí es donde en el futuro enviaremos la notificación push)
    }

    // 5. Guardamos los cambios en la BD
    const medicamentoActualizado = await medicamento.save();
    
    res.json(medicamentoActualizado);

  } catch (error) {
    console.error('ERROR en GET /api/medicamentos:', error); // <-- AÑADE ESTA LÍNEA
    res.status(500).json({ mensaje: "Error al procesar la toma", error });
  }
});

// (Opcional) Ruta para RECARGAR STOCK
// PUT /api/medicamentos/:id/recargar
app.put('/api/medicamentos/:id/recargar', async (req, res) => {
    try {
        const { cantidad } = req.body; // Esperamos un JSON: { "cantidad": 30 }
        const medicamento = await Medicamento.findById(req.params.id);

        if (!medicamento) {
            return res.status(404).json({ mensaje: "Medicamento no encontrado" });
        }

        medicamento.stockActual += cantidad; // Sumamos la cantidad al stock

        medicamento.avisoStockEnviado = false;

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
        res.status(500).json({ mensaje: "Error al recargar stock", error });
    }
});

// [NUEVO] Ruta para ACTUALIZAR (Editar) un medicamento por ID
// PUT /api/medicamentos/:id
app.put('/api/medicamentos/:id', async (req, res) => {
  try {
    const { id } = req.params; // Obtenemos el ID de la URL
    const datosActualizados = req.body; // Obtenemos los nuevos datos del body

    // Buscamos y actualizamos en un solo paso
    // { new: true } es para que nos devuelva el documento ya actualizado
    const medicamentoActualizado = await Medicamento.findByIdAndUpdate(
      id, 
      datosActualizados, 
      { new: true, runValidators: true } // runValidators es para que chequee el "molde"
    );

    if (!medicamentoActualizado) {
      return res.status(404).json({ mensaje: "Medicamento no encontrado para actualizar" });
    }

    res.json(medicamentoActualizado);

  } catch (error) {
    res.status(400).json({ mensaje: "Error al actualizar el medicamento", error });
  }
});

// [NUEVO] Ruta para ELIMINAR un medicamento por ID
// DELETE /api/medicamentos/:id
app.delete('/api/medicamentos/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const medicamentoEliminado = await Medicamento.findByIdAndDelete(id);

    if (!medicamentoEliminado) {
      return res.status(404).json({ mensaje: "Medicamento no encontrado para eliminar" });
    }

    // Devolvemos un mensaje de éxito
    res.json({ mensaje: "Medicamento eliminado exitosamente" });

  } catch (error) {
    res.status(500).json({ mensaje: "Error al eliminar el medicamento", error });
  }
});

// [NUEVO] Ruta secreta para disparar el worker
app.get('/api/trigger-worker', (req, res) => {
  const { secret } = req.query; // Busca el secreto en la URL

  // 1. Verificamos que el secreto sea correcto
  if (secret !== process.env.CRON_SECRET) {
    console.log('Intento de ejecución de worker RECHAZADO (secreto incorrecto)');
    return res.status(401).send('No autorizado');
  }

  // 2. Si es correcto, respondemos INMEDIATAMENTE
  console.log('Intento de ejecución de worker ACEPTADO.');
  res.status(200).send('Tarea de descuento iniciada. (La tarea corre en segundo plano)');

  // 3. Y LUEGO, ejecutamos la tarea (sin "await")
  // Esto (sin await) permite que el servicio de cron reciba la respuesta
  // rápido, mientras la tarea pesada corre en segundo plano.
  ejecutarDescuentoStock();
});

app.get('/api/historial', async (req, res) => {
  try {
    // Buscamos los últimos 50 registros, ordenados del más nuevo al más viejo
    const historial = await Historial.find().sort({ fecha: -1 }).limit(50);
    res.json(historial);
  } catch (error) {
    console.error('ERROR en GET /api/historial:', error);
    res.status(500).json({ mensaje: "Error al obtener historial", error });
  }
});