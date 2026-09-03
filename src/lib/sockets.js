import { readFileSync } from "node:fs";
import pino from "pino";
import { telegram } from "./telegram.js";
import { generateGeminiReply } from "./gemini.js";
import { Chat } from "../models/chat.model.js";

const logger = pino();

// Almacén en memoria para asociar chatId con socketId
// Estructura: chatId -> { socketId, mode: "ai" | "human", history: [] }
export const sessions = new Map();
let socketServer = null;

const PROJECTS_FILE_URL = new URL("../data/projects.json", import.meta.url);
let projectsData = { profile: {}, skills: [], experience: [], projects: [], links: {} };
try {
  projectsData = JSON.parse(readFileSync(PROJECTS_FILE_URL, "utf-8"));
} catch (error) {
  logger.error("Could not load projects.json in sockets.js", error);
}

const SYSTEM_PROMPT = `
You are Jarvis, Julian Correa's personal AI assistant. 
Your goal is to converse with visitors in a warm, fluid, natural, and empathetic human manner—so much so that they feel like they are talking directly to a real, highly articulate human assistant.

CRITICAL HUMANIZATION & DIALOGUE STYLE RULES:
1. Speak warmly, expressively, and fluidly in continuous natural prose.
2. NEVER sound like a robot, bot, or technical manual. Never say "Como modelo de IA", "Como bot", or "A continuación presento".
3. ABSOLUTELY NO BULLET POINTS (*, -, 1., 2.), NO MARKDOWN LISTS, NO HEADERS (#, ##), AND NO RAW ARRAYS.
   - Speak in natural, cohesive paragraphs with smooth human connectors (e.g., "¡Claro que sí! Te cuento que...", "Mira, respecto a...", "De hecho, Julián ha desarrollado...", "Por cierto...").
4. Maintain a warm, hospitable Colombian/Latin American tone ("¡Qué gusto saludarte!", "Con mucho gusto...", "Estoy aquí para lo que necesites").
5. When asked about projects, give a fluid executive summary of his key work (such as the Real-Time GIS Emergency Portal, Flutter Mobile Social Apps, Next.js E-commerce & Payment Gateways, and .NET/Node.js Backends) without reading titles as a list.

Here is the structured profile context:
${JSON.stringify(projectsData, null, 2)}
`;

export function sendAdminMessage(chatId, text) {
  if (socketServer) {
    socketServer.to(chatId).emit("mensaje-servidor", { text, sender: "Julián" });

    // Guardar en el historial en memoria
    const session = sessions.get(chatId);
    if (session) {
      session.history.push({ role: "assistant", content: text, sender: "Julián" });
    }

    // Persistir en MongoDB
    Chat.updateOne(
      { chatId },
      {
        $push: {
          history: { role: "assistant", content: text, sender: "Julián" },
        },
      }
    ).catch((err) => logger.error(`Error al guardar mensaje de admin en DB para ${chatId}:`, err));

    return true;
  }
  return false;
}

export async function resetToAi(chatId) {
  const session = sessions.get(chatId);
  if (session) {
    session.mode = "ai";
  }

  try {
    await Chat.updateOne({ chatId }, { $set: { mode: "ai" } });
  } catch (err) {
    logger.error(`Error al restablecer modo en DB para ${chatId}:`, err);
  }

  if (socketServer) {
    socketServer.to(chatId).emit("live-chat-status", { mode: "ai" });
    socketServer.to(chatId).emit("mensaje-servidor", {
      text: "Julián ha finalizado el chat en vivo. La IA vuelve a estar activa.",
      sender: "Sistema",
    });
  }
  return true;
}

export function initSockets(io) {
  logger.info("Inicializando Socket.io handler...");
  socketServer = io;

  io.on("connection", (socket) => {
    logger.info(`Nuevo socket conectado: ${socket.id}`);

    // Cliente (Portafolio) se une a una sesión
    socket.on("join-chat", async ({ chatId }) => {
      if (!chatId) return;

      socket.join(chatId);
      logger.info(`Socket ${socket.id} se unió a la sala/sesión: ${chatId}`);

      try {
        // Cargar chat de MongoDB o crearlo si no existe
        let chat = await Chat.findOne({ chatId });
        if (!chat) {
          chat = await Chat.create({ chatId, mode: "ai", history: [] });
          logger.info(`Nueva sesión de chat creada en DB para ${chatId}.`);
        } else {
          logger.info(`Sesión recuperada de DB para ${chatId}. Modo: ${chat.mode}`);
        }

        // Actualizar el mapeo en memoria
        sessions.set(chatId, {
          socketId: socket.id,
          mode: chat.mode,
          history: chat.history,
        });

        // Enviar historial previo al cliente si tiene mensajes
        if (chat.history && chat.history.length > 0) {
          socket.emit("chat-history", chat.history);
        }

        // Notificar al cliente el estado actual del modo
        socket.emit("live-chat-status", { mode: chat.mode });
      } catch (err) {
        logger.error(`Error al unirse al chat ${chatId}:`, err);
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

      // Guardar el mensaje del usuario en el historial en memoria y MongoDB
      session.history.push({ role: "user", content: text });
      try {
        await Chat.updateOne(
          { chatId },
          {
            $push: {
              history: { role: "user", content: text },
            },
          }
        );
      } catch (err) {
        logger.error(`Error al persistir mensaje de cliente para ${chatId}:`, err);
      }

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
          await resetToAi(chatId);
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
          
          session.history.push({ role: "assistant", content: reply, sender: "IA" });
          
          // Persistir en MongoDB
          await Chat.updateOne(
            { chatId },
            {
              $push: {
                history: { role: "assistant", content: reply, sender: "IA" },
              },
            }
          );

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
      logger.info(`Sesión ${chatId} cambió a modo Humano (Julián) en memoria.`);

      try {
        await Chat.updateOne({ chatId }, { $set: { mode: "human" } });
      } catch (err) {
        logger.error(`Error al persistir cambio de modo para ${chatId}:`, err);
      }

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

    // Cliente finaliza chat en vivo y vuelve a la IA
    socket.on("exit-live-chat", async ({ chatId }) => {
      if (!chatId) return;
      const reset = await resetToAi(chatId);
      if (reset) {
        logger.info(`Sesión ${chatId} revertida a modo IA por el cliente.`);
        await telegram.sendMessage(
          `🏁 <b>[Chat Finalizado]</b>\nEl reclutador con ID <code>${chatId}</code> ha finalizado la sesión en directo. La IA vuelve a estar activa.`
        );
      }
    });

    socket.on("disconnect", () => {
      logger.info(`Socket desconectado: ${socket.id}`);
    });
  });
}
