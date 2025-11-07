// validations.js
const Joi = require('joi');

// Definimos el esquema de validación para un Medicamento
const medicamentoSchema = Joi.object({
  nombre: Joi.string()
    .min(2)
    .max(100)
    .trim()
    .required()
    .messages({
      'string.empty': 'El nombre no puede estar vacío',
      'string.min': 'El nombre debe tener al menos 2 caracteres',
      'string.max': 'El nombre no puede exceder los 100 caracteres',
      'any.required': 'El nombre es obligatorio'
    }),

  dosis: Joi.string()
    .allow('', null)
    .max(50)
    .trim()
    .messages({
      'string.max': 'La dosis no puede exceder los 50 caracteres'
    }),

  stockActual: Joi.number()
    .integer()
    .min(0)
    .required()
    .messages({
      'number.base': 'El stock actual debe ser un número',
      'number.min': 'El stock no puede ser negativo',
      'any.required': 'El stock actual es obligatorio'
    }),

  stockMinimo: Joi.number()
    .integer()
    .min(1)
    .required()
    .messages({
      'number.base': 'El stock mínimo debe ser un número',
      'number.min': 'El stock mínimo debe ser al menos 1',
      'any.required': 'El stock mínimo es obligatorio'
    }),

  horarios: Joi.array()
    .items(
      Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/) // Valida formato HH:MM
    )
    .min(1)
    .required()
    .messages({
      'array.min': 'Debes añadir al menos un horario',
      'string.pattern.base': 'Los horarios deben tener el formato HH:MM (ej: 09:00)'
    }),

  fechaVencimiento: Joi.date()
    .allow(null, '')
    .iso() // Espera formato fecha estándar (ISO)
    .messages({
      'date.base': 'La fecha de vencimiento debe ser una fecha válida'
    }),

  // Permitimos estos campos extra que a veces manda Mongoose o el frontend
  _id: Joi.string().allow(null, ''),
  __vx: Joi.number().allow(null, ''),
  avisoStockEnviado: Joi.boolean(),
  avisoVencimientoEnviado: Joi.boolean(),
  diasRestantes: Joi.number().allow(null) // Campo calculado, lo ignoramos si viene
});

// Función middleware que usaremos en las rutas
const validarMedicamento = (req, res, next) => {
  const { error } = medicamentoSchema.validate(req.body, { abortEarly: false });

  if (error) {
    // Si hay errores, los formateamos para devolverlos limpios
    const mensajesErrores = error.details.mapEb(detalle => detalle.message);
    return res.status(400).json({
      mensaje: "Error de validación",
      errores: mensajesErrores
    });
  }

  // Si todo está bien, seguimos adelante
  next();
};

module.exports = { validarMedicamento };