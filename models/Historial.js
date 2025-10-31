// models/Historial.js

const mongoose = require('mongoose');

const HistorialSchema = new mongoose.Schema({
  fecha: {
    type: Date,
    default: Date.now // La fecha se pone sola
  },
  medicamentoNombre: {
    type: String,
    required: true
  },
  movimiento: {
    type: Number, // Ej: -1, +30
    required: true
  },
  tipo: {
    type: String, // Ej: "Automático" o "Recarga"
    required: true
  }
});

// Opcional: Creamos un "índice" para que la base de datos
// ordene los registros por fecha de forma más rápida.
HistorialSchema.index({ fecha: -1 });

module.exports = mongoose.model('Historial', HistorialSchema);