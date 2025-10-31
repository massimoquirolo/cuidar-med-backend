// models/Medicamento.js

const mongoose = require('mongoose');

// Este es el "Molde" o "Plano" de cómo debe ser un medicamento
const MedicamentoSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true, // El nombre es obligatorio
    trim: true      // Quita espacios en blanco al inicio y al final
  },
  dosis: {
    type: String,
    required: false // La dosis es opcional
  },
  stockActual: {
    type: Number,
    required: true,
    default: 0      // Si no me lo dan, empieza en 0
  },
  stockMinimo: {
    type: Number,
    required: true,
    default: 5       // Por defecto, avisará cuando queden 5
  },
  horarios: [String], // Un array de strings, ej: ["09:00", "21:00"]
  avisoStockEnviado: {
    type: Boolean,
    default: false
  },
  // [NUEVOS CAMPOS]
  fechaVencimiento: {
    type: Date,
    required: false // ¡Es opcional!
  },
  avisoVencimientoEnviado: {
    type: Boolean,
    default: false
  }
});

// Exportamos el modelo para que nuestro index.js pueda usarlo
module.exports = mongoose.model('Medicamento', MedicamentoSchema);