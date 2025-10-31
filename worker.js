// worker.js

const mongoose = require('mongoose');
const Medicamento = require('./models/Medicamento');
const Historial = require('./models/Historial'); // <-- CAMBIO 1: Importamos el nuevo molde

// Nueva función para enviar un mensaje de Telegram
// (Esta es tu función, sin cambios)
const enviarTelegram = async (medicamento) => {
  console.log(`Intentando enviar Telegram para ${medicamento.nombre}...`);
  
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  // Mensaje con formato HTML (Telegram lo soporta)
  const mensaje = `
<b>🔔 Alerta de Stock Bajo 🔔</b>

El medicamento <b>${medicamento.nombre} (${medicamento.dosis})</b> se está acabando.

Quedan solo <b>${medicamento.stockActual}</b> unidades (el mínimo es ${medicamento.stockMimo}).

Por favor, recarga el stock en la aplicación.
  `;
  
  try {
    // Usamos fetch (que ya viene en Node.js) para enviar el mensaje
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: mensaje,
        parse_mode: 'HTML', // Le decimos a Telegram que use HTML
      }),
    });
    
    const data = await response.json();
    
    if (!data.ok) {
      // Si Telegram da un error (ej: chat no encontrado)
      console.error('Error de la API de Telegram:', data.description);
      return false;
    }
    
    console.log(`Telegram enviado con éxito para: ${medicamento.nombre}`);
    return true;
    
  } catch (error) {
    console.error(`Error al enviar Telegram (catch):`, error);
    return false;
  }
};

// --- Función principal (modificada para registrar historial) ---
const ejecutarDescuentoStock = async () => {
  // CAMBIO 2: Actualizamos el mensaje de log
  console.log('--- Iniciando Worker de CuidarMed (con Historial) ---');
  
  try {
    // Obtenemos la hora actual en Argentina
    const opcionesHora = { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false };
    const horaActualArgentina = new Date().toLocaleString('es-AR', opcionesHora);
    console.log(`Hora actual (Argentina): ${horaActualArgentina}`);


    // --- CAMBIO 3: LÓGICA DE DESCUENTO Y REGISTRO ---
    // (Reemplazamos tu 'updateMany' simple por este bloque)

    // 1. Primero encontramos qué medicamentos hay que descontar
    const medsADescontar = await Medicamento.find({ 
      horarios: horaActualArgentina, 
      stockActual: { $gt: 0 } 
    }).select('nombre'); // Solo traemos el nombre

    if (medsADescontar.length > 0) {
      // 2. Descontamos el stock
      await Medicamento.updateMany(
        { _id: { $in: medsADescontar.map(m => m._id) } }, // Descontamos solo los que encontramos
        { $inc: { stockActual: -1 } }
      );

      // 3. Creamos las entradas del historial
      const logEntries = medsADescontar.map(med => ({
        fecha: new Date(),
        medicamentoNombre: med.nombre,
        movimiento: -1,
        tipo: 'Automático'
      }));
      
      await Historial.insertMany(logEntries); // Guardamos todos los logs de una vez
      console.log(`Stock descontado y registrado en historial para ${medsADescontar.length} medicamentos.`);
    } else {
      console.log('No hay medicamentos para actualizar en este minuto.');
    }
    // --- FIN DEL CAMBIO ---


    // Buscamos medicamentos que necesiten aviso
    // (Esta parte es tuya, sin cambios)
    const medicamentosConStockBajo = await Medicamento.find({
      $expr: { $lte: ["$stockActual", "$stockMinimo"] }, 
      avisoStockEnviado: false 
    });

    if (medicamentosConStockBajo.length > 0) {
      console.log(`Encontrados ${medicamentosConStockBajo.length} medicamentos con stock bajo para notificar.`);
      
      for (const med of medicamentosConStockBajo) {
        const telegramEnviado = await enviarTelegram(med); 
        
        if (telegramEnviado) {
          med.avisoStockEnviado = true;
          await med.save();
        }
      }
    } else {
      console.log('No hay medicamentos nuevos con stock bajo para notificar.');
    }

  } catch (error) {
    console.error('Error en el worker:', error);
  } finally {
    console.log('--- Worker de CuidarMed finalizado ---');
  }
};

// Exportamos la función
// (Esto es tuyo, sin cambios)
module.exports = { ejecutarDescuentoStock };