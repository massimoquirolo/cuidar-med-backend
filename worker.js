// worker.js

const mongoose = require('mongoose');
const Medicamento = require('./models/Medicamento');
const { Resend } = require('resend'); // <--- 1. Importamos Resend

// 2. Creamos la instancia de Resend (usa la variable de Render)
const resend = new Resend(process.env.RESEND_API_KEY); 

// Función para enviar el email (¡mucho más simple!)
const enviarEmail = async (medicamento) => {
  console.log(`Intentando enviar email para ${medicamento.nombre}...`);

  try {
    const { data, error } = await resend.emails.send({
      // 3. ¡IMPORTANTE! Usamos el "dominio de prueba" de Resend
      from: 'CuidarMed Alerta <onboarding@resend.dev>', 
      to: [process.env.EMAIL_TO], // Tu email personal (de .env)
      subject: `¡Alerta de Stock Bajo! - ${medicamento.nombre}`,
      html: `
        <h1>Alerta de Stock Bajo</h1>
        <p>El medicamento <strong>${medicamento.nombre} (${medicamento.dosis})</strong> se está acabando.</p>
        <p>Quedan solo <strong>${medicamento.stockActual}</strong> unidades (el mínimo es ${medicamento.stockMinimo}).</p>
        <p>Por favor, recarga el stock en la aplicación.</p>
      `
    });

    // 4. Manejamos la respuesta de Resend
    if (error) {
      console.error(`Error de Resend:`, error);
      return false;
    }

    console.log(`Email de alerta enviado con éxito para: ${medicamento.nombre}`);
    return true;

  } catch (error) {
    console.error(`Error al enviar email (catch):`, error);
    return false;
  }
};

// --- Función principal (sin cambios) ---
const ejecutarDescuentoStock = async () => {
  console.log('--- Iniciando Worker de CuidarMed (con Resend) ---');

  try {
    // ... (Obtener hora actual, igual que antes) ...
    const opcionesHora = { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false };
    const horaActualArgentina = new Date().toLocaleString('es-AR', opcionesHora);

    // ... (Descontamos el stock, igual que antes) ...
    await Medicamento.updateMany(
      { horarios: horaActualArgentina, stockActual: { $gt: 0 } },
      { $inc: { stockActual: -1 } }
    );

    // ... (Lógica de buscar stock bajo, igual que antes) ...
    const medicamentosConStockBajo = await Medicamento.find({
      $expr: { $lte: ["$stockActual", "$stockMinimo"] }, 
      avisoStockEnviado: false 
    });

    if (medicamentosConStockBajo.length > 0) {
      console.log(`Encontrados ${medicamentosConStockBajo.length} medicamentos con stock bajo para notificar.`);

      for (const med of medicamentosConStockBajo) {
        const emailEnviado = await enviarEmail(med);

        if (emailEnviado) {
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