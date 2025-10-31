// worker.js

const mongoose = require('mongoose');
const Medicamento = require('./models/Medicamento');
const Historial = require('./models/Historial'); // <-- CAMBIO 1: Importamos el nuevo molde

// Nueva función para enviar un mensaje de Telegram
// (Esta es tu función, sin cambios)
// --- Función de Telegram (¡AHORA ES MÁS INTELIGENTE!) ---
const enviarTelegram = async (medicamento, tipoAviso) => {

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  let mensaje = ''; // Lo definimos vacío

  // Creamos el mensaje según el tipo de aviso
  if (tipoAviso === 'stock') {
    console.log(`Intentando enviar Telegram de STOCK para ${medicamento.nombre}...`);
    mensaje = `
<b>🔔 Alerta de Stock Bajo 🔔</b>

El medicamento <b>${medicamento.nombre} (${medicamento.dosis})</b> se está acabando.

Quedan solo <b>${medicamento.stockActual}</b> unidades (el mínimo es ${medicamento.stockMinimo}).

Por favor, recarga el stock en la aplicación.
    `;
  } else if (tipoAviso === 'vencimiento') {
    console.log(`Intentando enviar Telegram de VENCIMIENTO para ${medicamento.nombre}...`);
    const fecha = new Date(medicamento.fechaVencimiento).toLocaleDateString('es-AR');
    mensaje = `
<b>🗓️ Alerta de Vencimiento 🗓️</b>

La caja del medicamento <b>${medicamento.nombre} (${medicamento.dosis})</b> está próxima a vencerse.

Fecha de Vencimiento: <b>${fecha}</b>

(Stock actual: ${medicamento.stockActual} unidades)
    `;
  } else {
    return false; // Tipo de aviso desconocido
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: mensaje,
        parse_mode: 'HTML',
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error('Error de la API de Telegram:', data.description);
      return false;
    }

    console.log(`Telegram de ${tipoAviso} enviado con éxito para: ${medicamento.nombre}`);
    return true;

  } catch (error) {
    console.error(`Error al enviar Telegram (catch):`, error);
    return false;
  }
};

// --- Función principal (¡AHORA HACE DOS TAREAS!) ---
const ejecutarDescuentoStock = async () => {
  console.log('--- Iniciando Worker de CuidarMed (Stock + Vencimiento) ---');

  try {
    // --- TAREA 1: DESCONTAR STOCK Y AVISAR (sin cambios) ---

    const opcionesHora = { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false };
    const horaActualArgentina = new Date().toLocaleString('es-AR', opcionesHora);

    // 1. Encontrar y descontar (lógica de historial)
    const medsADescontar = await Medicamento.find({ 
      horarios: horaActualArgentina, 
      stockActual: { $gt: 0 } 
    }).select('nombre');

    if (medsADescontar.length > 0) {
      await Medicamento.updateMany(
        { _id: { $in: medsADescontar.map(m => m._id) } },
        { $inc: { stockActual: -1 } }
      );
      const logEntries = medsADescontar.map(med => ({
        fecha: new Date(),
        medicamentoNombre: med.nombre,
        movimiento: -1,
        tipo: 'Automático'
      }));
      await Historial.insertMany(logEntries);
      console.log(`Stock descontado y registrado para ${medsADescontar.length} meds.`);
    } else {
      console.log('No hay medicamentos para descontar en este minuto.');
    }

    // 2. Avisar por Stock Bajo (lógica de Telegram)
    const medsStockBajo = await Medicamento.find({
      $expr: { $lte: ["$stockActual", "$stockMinimo"] }, 
      avisoStockEnviado: false 
    });

    if (medsStockBajo.length > 0) {
      console.log(`Encontrados ${medsStockBajo.length} meds con stock bajo para notificar.`);
      for (const med of medsStockBajo) {
        const telegramEnviado = await enviarTelegram(med, 'stock'); // 'stock'
        if (telegramEnviado) {
          med.avisoStockEnviado = true;
          await med.save();
        }
      }
    } else {
      console.log('No hay nuevos avisos de stock bajo.');
    }

    // --- TAREA 2: CHEQUEAR VENCIMIENTOS (¡NUEVO!) ---

    const hoy = new Date();
    const fechaLimite = new Date();
    fechaLimite.setDate(hoy.getDate() + 30); // Calculamos la fecha de "hoy + 30 días"

    // 1. Buscamos medicamentos que...
    const medsPorVencer = await Medicamento.find({
      fechaVencimiento: { $ne: null },          // 1. Tengan una fecha cargada
      avisoVencimientoEnviado: false,            // 2. No hayamos avisado
      fechaVencimiento: { $lte: fechaLimite }   // 3. Y se venzan en los próximos 30 días
    });

    if (medsPorVencer.length > 0) {
      console.log(`Encontrados ${medsPorVencer.length} medicamentos PRÓXIMOS A VENCER.`);

      for (const med of medsPorVencer) {
        // 2. Enviamos un aviso de vencimiento
        const telegramEnviado = await enviarTelegram(med, 'vencimiento'); // 'vencimiento'
        if (telegramEnviado) {
          // 3. Marcamos como avisado
          med.avisoVencimientoEnviado = true;
          await med.save();
        }
      }
    } else {
      console.log('No hay medicamentos nuevos próximos a vencer.');
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