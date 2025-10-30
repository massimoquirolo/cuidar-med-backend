// worker.js

const mongoose = require('mongoose');
const Medicamento = require('./models/Medicamento'); // Importamos el mismo "molde"
require('dotenv').config(); // Carga el MONGO_URI

// Función principal del trabajador
const ejecutarDescuentoStock = async () => {
  console.log('--- Iniciando Worker de CuidarMed ---');

  try {
    // 1. Conectarnos a la base de datos
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Worker conectado a MongoDB.');

    // 2. Obtener la hora ACTUAL en Argentina
    // Esto es crucial. El servidor de Render está en UTC (otro país).
    // Necesitamos la hora de tu zona horaria.
    const opcionesHora = {
      timeZone: 'America/Argentina/Buenos_Aires', // ¡Asegúrate que sea tu zona horaria!
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };
    const horaActualArgentina = new Date().toLocaleString('es-AR', opcionesHora);

    console.log(`Hora actual (Argentina): ${horaActualArgentina}`);

    // 3. Buscar y actualizar medicamentos
    // Buscamos todos los medicamentos que...
    //   a) Tengan la hora actual en su array de 'horarios'
    //   b) Tengan stock mayor a 0
    // ...y les restamos 1 al 'stockActual'.
    const resultado = await Medicamento.updateMany(
      { 
        horarios: horaActualArgentina, 
        stockActual: { $gt: 0 } 
      },
      { 
        $inc: { stockActual: -1 } 
      }
    );

    if (resultado.modifiedCount > 0) {
      console.log(`¡ÉXITO! Se actualizaron ${resultado.modifiedCount} medicamentos.`);
    } else {
      console.log('No hay medicamentos para actualizar en este minuto.');
    }

  } catch (error) {
    console.error('Error en el worker:', error);
  } finally {
    // 4. Desconectarnos de la base de datos
    await mongoose.disconnect();
    console.log('Worker desconectado de MongoDB.');
    console.log('--- Worker de CuidarMed finalizado ---');
  }
};

// Ejecutamos la función
ejecutarDescuentoStock();