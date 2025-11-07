// telegramHelper.js
    
// Esta es una función genérica que solo sabe enviar un mensaje.
// No sabe "por qué" lo envía, solo lo envía.
const enviarMensajeTelegram = async (mensaje) => {
    console.log('Intentando enviar mensaje por Telegram...');
    
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    
    if (!botToken || !chatId) {
    console.error('Error: TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no están definidos.');
    return false;
    }
    
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    try {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        },
        body: JSON.stringify({
        chat_id: chatId,
        text: mensaje,
        parse_mode: 'HTML', // Usamos HTML para negritas, etc.
        }),
    });
    
    const data = await response.json();
    
    if (!data.ok) {
        console.error('Error de la API de Telegram:', data.description);
        return false;
    }
    
    console.log('Mensaje de Telegram enviado con éxito.');
    return true;
    
    } catch (error) {
    console.error(`Error al enviar Telegram (catch):`, error);
    return false;
    }
};

// Exportamos la función para que otros archivos puedan usarla
module.exports = { enviarMensajeTelegram };