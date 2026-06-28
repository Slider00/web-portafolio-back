import pino from "pino";

const logger = pino();

/**
 * Módulo para interactuar con la API del Bot de Telegram usando fetch nativo.
 */
export class TelegramClient {
  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_MY_CHAT_ID;
    this.webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
    this.apiUrl = `https://api.telegram.org/bot${this.token}`;
  }

  /**
   * Verifica si la configuración mínima de Telegram está disponible.
   */
  isValid() {
    return !!(this.token && this.chatId);
  }

  /**
   * Envía un mensaje de texto al chat configurado.
   */
  async sendMessage(text) {
    if (!this.isValid()) {
      logger.warn("Telegram no configurado. Omitiendo envío de mensaje.");
      return false;
    }

    try {
      const response = await fetch(`${this.apiUrl}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: text,
          parse_mode: "HTML",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Error de la API de Telegram al enviar mensaje: ${errorText}`);
        return false;
      }

      return true;
    } catch (error) {
      logger.error("Error de red al comunicarse con Telegram:", error);
      return false;
    }
  }

  /**
   * Configura automáticamente el Webhook oficial con la API de Telegram.
   */
  async setWebhook() {
    if (!this.token) {
      logger.warn("Falta TELEGRAM_BOT_TOKEN. No se pudo configurar el Webhook.");
      return false;
    }

    if (!this.webhookUrl) {
      logger.info(
        "Falta TELEGRAM_WEBHOOK_URL. Para desarrollo local, configura ngrok y añade la URL en tu .env para recibir respuestas."
      );
      return false;
    }

    const endpoint = `${this.webhookUrl}/api/telegram/webhook`;
    logger.info(`Configurando Webhook de Telegram hacia: ${endpoint}`);

    try {
      const response = await fetch(`${this.apiUrl}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: endpoint }),
      });

      const result = await response.json();
      if (result.ok) {
        logger.info(`Webhook de Telegram registrado con éxito: ${result.description}`);
        return true;
      } else {
        logger.error(`Error al registrar Webhook de Telegram: ${result.description}`);
        return false;
      }
    } catch (error) {
      logger.error("Error al establecer Webhook de Telegram:", error);
      return false;
    }
  }
}

export const telegram = new TelegramClient();
export default telegram;
