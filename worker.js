// worker.js
    
    const mongoose = require('mongoose');
    const Medicamento = require('./models/Medicamento');
    const Historial = require('./models/Historial');
    // 1. Importamos nuestro nuevo "ayudante" de Telegram
    const { enviarMensajeTelegram } = require('./telegramHelper');
    
    // --- Función principal (modificada para registrar historial) ---
    const ejecutarDescuentoStock = async () => {
      console.log('--- Iniciando Worker de CuidarMed (con Historial) ---');
      
      try {
        // ... (Obtener hora actual) ...
        const opcionesHora = { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false };
        const horaActualArgentina = new Date().toLocaleString('es-AR', opcionesHora);
        console.log(`Hora actual (Argentina): ${horaActualArgentina}`);
    
        // ... (Lógica de descuento e historial) ...
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
    
        // ... (Lógica de buscar stock bajo) ...
        const medsStockBajo = await Medicamento.find({
          $expr: { $lte: ["$stockActual", "$stockMinimo"] }, 
          avisoStockEnviado: false 
        });
    
        if (medsStockBajo.length > 0) {
          console.log(`Encontrados ${medsStockBajo.length} meds con stock bajo para notificar.`);
          for (const med of medsStockBajo) {
            
            // 2. Creamos el mensaje de ALERTA DE STOCK
            const mensajeStock = `
    <b>🔔 Alerta de Stock Bajo 🔔</b>
    
    El medicamento <b>${med.nombre} (${med.dosis})</b> se está acabando.
    Quedan solo <b>${med.stockActual}</b> unidades (mínimo ${med.stockMinimo}).
            `;
            // 3. Usamos el helper para enviar
            const telegramEnviado = await enviarMensajeTelegram(mensajeStock); 
            
            if (telegramEnviado) {
              med.avisoStockEnviado = true;
              await med.save();
            }
          }
        } else {
          console.log('No hay nuevos avisos de stock bajo.');
        }
    
        // ... (Lógica de buscar vencimiento) ...
        const hoy = new Date();
        const fechaLimite = new Date();
        fechaLimite.setDate(hoy.getDate() + 30);
    
        const medsPorVencer = await Medicamento.find({
          fechaVencimiento: { $ne: null },
          avisoVencimientoEnviado: false,
          fechaVencimiento: { $lte: fechaLimite }
        });
    
        if (medsPorVencer.length > 0) {
          console.log(`Encontrados ${medsPorVencer.length} meds PRÓXIMOS A VENCER.`);
          for (const med of medsPorVencer) {
            
            // 4. Creamos el mensaje de ALERTA DE VENCIMIENTO
            const fecha = new Date(med.fechaVencimiento).toLocaleDateString('es-AR');
            const mensajeVencimiento = `
    <b>🗓️ Alerta de Vencimiento 🗓️</b>
    
    La caja de <b>${med.nombre} (${med.dosis})</b> está próxima a vencerse.
    Fecha de Vencimiento: <b>${fecha}</b>
            `;
            // 5. Usamos el helper para enviar
            const telegramEnviado = await enviarMensajeTelegram(mensajeVencimiento);
            
            if (telegramEnviado) {
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
    module.exports = { ejecutarDescuentoStock };