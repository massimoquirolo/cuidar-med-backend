// worker.js

const mongoose = require('mongoose');
const Medicamento = require('./models/Medicamento');

// Convertimos el worker en una función que podemos "llamar"
const ejecutarDescuentoStock = async () => {
  console.log('--- Iniciando Worker de CuidarMed (disparado por Cron) ---');
  let conexion; // Variable para guardar la conexión

  try {
    // 1. Conectarnos a la base de datos
    // Usamos una variable para poder cerrarla después
    conexion = await mongoose.connect(process.env.MONGO_URI);
    console.log('Worker conectado a MongoDB.');

    // 2. Obtener la hora ACTUAL en Argentina
    const opcionesHora = {
      timeZone: 'America/Argentina/Buenos_Aires', // ¡Tu zona horaria!
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };
    const horaActualArgentina = new Date().toLocaleString('es-AR', opcionesHora);

    console.log(`Hora actual (Argentina): ${horaActualArgentina}`);

    // 3. Buscar y actualizar medicamentos
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
    // 4. Desconectarnos de la base de datos (si logramos conectarnos)
    if (conexion) {
      await mongoose.disconnect();
      console.log('Worker desconectado de MongoDB.');
    }
    console.log('--- Worker de CuidarMed finalizado ---');
  }
};

// ¡LA PARTE CLAVE! Exportamos la función para que index.js pueda usarla
module.exports = { ejecutarDescuentoStock };