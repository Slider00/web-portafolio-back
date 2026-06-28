import http from "node:http";
import dotenvSafe from "dotenv-safe";
import { Server } from "socket.io";
import { app } from "./app.js";
import { initSockets } from "./lib/sockets.js";
import { telegram } from "./lib/telegram.js";

dotenvSafe.config({
  allowEmptyValues: true
});

const port = Number(process.env.PORT || 4000);
const server = http.createServer(app);

// Inicializar Servidor de Sockets con CORS habilitado
const io = new Server(server, {
  cors: {
    origin: [
      process.env.FRONTEND_ORIGIN || "http://localhost:5173",
      process.env.FRONTEND_ORIGIN_PROD,
    ].filter(Boolean),
    methods: ["GET", "POST"],
  },
});

initSockets(io);

server.listen(port, async () => {
  console.log(`API + WebSockets running on http://localhost:${port}`);
  
  // Registrar Webhook con Telegram
  await telegram.setWebhook();
});
