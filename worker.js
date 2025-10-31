// worker.js

const mongoose = require('mongoose');
const Medicamento = require('./models/Medicamento');

// ¡Ya no importamos Resend!

// Nueva función para enviar un mensaje de Telegram
const enviarTelegram = async (medicamento) => {
  console.log(`Intentando enviar Telegram para ${medicamento.nombre}...`);
  
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  // Mensaje con formato HTML (Telegram lo soporta)
  const mensaje = `
<b>🔔 Alerta de Stock Bajo 🔔</b>

El medicamento <b>${medicamento.nombre} (${medicamento.dosis})</b> se está acabando.

Quedan solo <b>${medicamento.stockActual}</b> unidades (el mínimo es ${medicamento.stockMinimo}).

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

// --- Función principal (modificada para llamar a enviarTelegram) ---
const ejecutarDescuentoStock = async () => {
  console.log('--- Iniciando Worker de CuidarMed (con Telegram) ---');
  
  try {
    // Obtenemos la hora actual en Argentina
    const opcionesHora = { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false };
    const horaActualArgentina = new Date().toLocaleString('es-AR', opcionesHora);
    console.log(`Hora actual (Argentina): ${horaActualArgentina}`);

    // Descontamos el stock (igual que antes)
    await Medicamento.updateMany(
      { horarios: horaActualArgentina, stockActual: { $gt: 0 } },
      { $inc: { stockActual: -1 } }
    );

    // Buscamos medicamentos que necesiten aviso
    const medicamentosConStockBajo = await Medicamento.find({
      $expr: { $lte: ["$stockActual", "$stockMinimo"] }, 
      avisoStockEnviado: false 
    });

    if (medicamentosConStockBajo.length > 0) {
      console.log(`Encontrados ${medicamentosConStockBajo.length} medicamentos con stock bajo para notificar.`);
      
      for (const med of medicamentosConStockBajo) {
        // *** ¡AQUÍ ESTÁ EL CAMBIO! ***
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
module.exports = { ejecutarDescuentoStock };