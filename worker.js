// worker.js

const mongoose = require('mongoose');
const Medicamento = require('./models/Medicamento');
const nodemailer = require('nodemailer'); // <--- 1. Importamos Nodemailer

// Función para enviar el email
const enviarEmail = async (medicamento) => {
  // 2. Creamos el "transporter" (el cartero)
  let transporter = nodemailer.createTransport({
    service: 'gmail', // Usamos Gmail
    auth: {
      user: process.env.EMAIL_USER, // Tu email (de .env)
      pass: process.env.EMAIL_PASS, // Tu contraseña de App (de .env)
    },
  });

  // 3. Definimos el contenido del email
  let mailOptions = {
    from: `Alerta CuidarMed <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_TO, // Tu email personal (de .env)
    subject: `¡Alerta de Stock Bajo! - ${medicamento.nombre}`,
    html: `
      <h1>Alerta de Stock Bajo</h1>
      <p>El medicamento <strong>${medicamento.nombre} (${medicamento.dosis})</strong> se está acabando.</p>
      <p>Quedan solo <strong>${medicamento.stockActual}</strong> unidades (el mínimo es ${medicamento.stockMinimo}).</p>
      <p>Por favor, recarga el stock en la aplicación.</p>
    `
  };

  // 4. Enviamos el email
  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email de alerta enviado para: ${medicamento.nombre}`);
    return true;
  } catch (error) {
    console.error(`Error al enviar email para ${medicamento.nombre}:`, error);
    return false;
  }
};

// Función principal (la que ya teníamos, pero mejorada)
const ejecutarDescuentoStock = async () => {
  console.log('--- Iniciando Worker de CuidarMed (con avisos de stock) ---');

  try {
    // ... (Obtener hora actual, igual que antes) ...
    const opcionesHora = { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false };
    const horaActualArgentina = new Date().toLocaleString('es-AR', opcionesHora);

    // 5. Descontamos el stock (igual que antes)
    await Medicamento.updateMany(
      { horarios: horaActualArgentina, stockActual: { $gt: 0 } },
      { $inc: { stockActual: -1 } }
    );

    // 6. [NUEVA LÓGICA] Buscamos medicamentos que necesiten aviso
    const medicamentosConStockBajo = await Medicamento.find({
      $expr: { $lte: ["$stockActual", "$stockMinimo"] }, // Donde stock <= minimo
      avisoStockEnviado: false // Y que NO hayamos avisado antes
    });

    // 7. Si encontramos alguno...
    if (medicamentosConStockBajo.length > 0) {
      console.log(`Encontrados ${medicamentosConStockBajo.length} medicamentos con stock bajo para notificar.`);

      for (const med of medicamentosConStockBajo) {
        // Intentamos enviar el email
        const emailEnviado = await enviarEmail(med);

        if (emailEnviado) {
          // Si el email se envió, marcamos el flag en la DB
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