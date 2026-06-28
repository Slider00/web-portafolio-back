import pino from "pino";
import { telegram } from "./telegram.js";
import { generateGeminiReply } from "./gemini.js";

const logger = pino();

// Almacén en memoria para hilos de chat
// Estructura: chatId -> { socketId, mode: "ai" | "human", history: [] }
export const sessions = new Map();
let socketServer = null;

const SYSTEM_PROMPT = `
You are Julian Correa's portfolio assistant.
Answer based on his profile, projects, skills and experience.
Be concise, clear, professional.
`;

export function sendAdminMessage(chatId, text) {
  if (socketServer) {
    socketServer.to(chatId).emit("mensaje-servidor", { text, sender: "Julián" });
    return true;
  }
  return false;
}

export function initSockets(io) {
  socketServer = io;
  logger.info("Inicializando Socket.io handler...");

  io.on("connection", (socket) => {
    logger.info(`Nuevo socket conectado: ${socket.id}`);

    // Cliente (Portafolio) se une a una sesión
    socket.on("join-chat", ({ chatId }) => {
      if (!chatId) return;

      socket.join(chatId);
      logger.info(`Socket ${socket.id} se unió a la sala/sesión: ${chatId}`);

      // Recuperar o inicializar sesión
      if (sessions.has(chatId)) {
        const session = sessions.get(chatId);
        session.socketId = socket.id; // Actualizar con el socket ID actual
        logger.info(`Sesión recuperada para ${chatId}. Modo actual: ${session.mode}`);
        // Notificar al cliente el estado actual del modo
        socket.emit("live-chat-status", { mode: session.mode });
      } else {
        sessions.set(chatId, {
          socketId: socket.id,
          mode: "ai",
          history: [],
        });
        logger.info(`Nueva sesión creada para ${chatId}.`);
        socket.emit("live-chat-status", { mode: "ai" });
      }
    });

    // Cliente envía mensaje
    socket.on("mensaje-cliente", async ({ chatId, text }) => {
      if (!chatId || !text) return;

      const session = sessions.get(chatId);
      if (!session) {
        logger.warn(`Mensaje recibido para sesión inexistente: ${chatId}`);
        return;
      }

      // Guardar el mensaje del usuario en el historial
      session.history.push({ role: "user", content: text });

      if (session.mode === "human") {
        // Enrutar mensaje a Telegram
        logger.info(`Enrutando mensaje de ${chatId} a Telegram.`);
        const telegramSent = await telegram.sendMessage(
          `💬 <b>[Reclutador id: <code>${chatId}</code>]</b> dice:\n\n"${text}"`
        );
        if (!telegramSent) {
          socket.emit("mensaje-servidor", {
            text: "No se pudo contactar a Julián temporalmente. La IA responderá en su lugar.",
            sender: "Sistema",
          });
          // Revertir a IA temporalmente
          session.mode = "ai";
          socket.emit("live-chat-status", { mode: "ai" });
        }
      } else {
        // Enrutar mensaje a la IA (Gemini)
        logger.info(`Enrutando mensaje de ${chatId} a la IA.`);
        try {
          // Filtrar historial para Gemini (formato correcto de roles)
          const historyMessages = session.history.slice(0, -1).map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: m.content,
          }));

          const reply = await generateGeminiReply(text, historyMessages, SYSTEM_PROMPT);
          session.history.push({ role: "assistant", content: reply });

          // Emitir respuesta al cliente
          io.to(chatId).emit("mensaje-servidor", { text: reply, sender: "IA" });
        } catch (error) {
          logger.error("Error al procesar respuesta de Gemini en Sockets:", error);
          socket.emit("mensaje-servidor", {
            text: "Hubo un problema al procesar tu solicitud. Por favor intenta de nuevo.",
            sender: "IA",
          });
        }
      }
    });

    // Cliente solicita hablar con Julián en directo
    socket.on("request-live-chat", async ({ chatId }) => {
      if (!chatId) return;

      const session = sessions.get(chatId);
      if (!session) return;

      session.mode = "human";
      logger.info(`Sesión ${chatId} cambió a modo Humano (Julián).`);

      // Notificar al cliente
      io.to(chatId).emit("live-chat-status", { mode: "human" });
      io.to(chatId).emit("mensaje-servidor", {
        text: "He notificado a Julián en su teléfono. Te responderá en directo en un momento.",
        sender: "Sistema",
      });

      // Enviar alerta a Telegram
      await telegram.sendMessage(
        `🔔 <b>[Alerta de Contratación]</b>\nUn reclutador con ID <code>${chatId}</code> ha solicitado hablar contigo en directo.\n\n<i>Responde a este mensaje para chatear.</i>`
      );
    });

    socket.on("disconnect", () => {
      logger.info(`Socket desconectado: ${socket.id}`);
      // Nota: No borramos la sesión del mapa para permitir reconexiones y mantener el historial.
    });
  });
}
