// worker.js

const mongoose = require('mongoose');
const Medicamento = require('./models/Medicamento');

// Esta función AHORA ASUME que Mongoose YA está conectado
// gracias a index.js
const ejecutarDescuentoStock = async () => {
  console.log('--- Iniciando Worker de CuidarMed (disparado por Cron) ---');

  try {
    // 1. Obtener la hora ACTUAL en Argentina
    const opcionesHora = {
      timeZone: 'America/Argentina/Buenos_Aires', // ¡Tu zona horaria!
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };
    const horaActualArgentina = new Date().toLocaleString('es-AR', opcionesHora);

    console.log(`Hora actual (Argentina): ${horaActualArgentina}`);

    // 2. Buscar y actualizar medicamentos
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
    // Imprimimos el error si el worker falla
    console.error('Error en el worker:', error);
  } finally {
    // 3. Ya NO nos desconectamos
    console.log('--- Worker de CuidarMed finalizado (dejando conexión abierta) ---');
  }
};

// Exportamos la función para que index.js pueda usarla
module.exports = { ejecutarDescuentoStock };