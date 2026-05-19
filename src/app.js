import cors from "cors";
import express from "express";
import { readFileSync } from "node:fs";
import helmet from "helmet";
import OpenAI from "openai";
import pinoHttp from "pino-http";
import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";

const app = express();
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  process.env.FRONTEND_ORIGIN_PROD,
].filter(Boolean);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        upgradeInsecureRequests: null,
      },
    },
  })
);
app.use(pinoHttp());
app.use(express.json());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin not allowed by CORS"));
    },
  })
);

const SYSTEM_PROMPT = `
You are Julian Correa's portfolio assistant.
Answer based on his profile, projects, skills and experience.
Be concise, clear, professional. If data is unknown, say so.
`;
const AI_PROVIDER = process.env.AI_PROVIDER || "ollama";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";
const WHATSAPP_NUMBER = "573195328292";
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;
const PROJECTS_FILE_URL = new URL("./data/projects.json", import.meta.url);
const projectsData = JSON.parse(readFileSync(PROJECTS_FILE_URL, "utf-8"));
const SUGGESTIONS = [
  "Muéstrame tus proyectos",
  "¿Qué tecnologías manejas?",
  "Cuéntame tu experiencia",
  "Quiero contactarte",
];
const portfolioLinks = projectsData.links || {};
const ACTIONS = [
  { type: "link", label: "WhatsApp", url: WHATSAPP_LINK },
  { type: "link", label: "GitHub", url: portfolioLinks.github || "https://github.com/" },
  {
    type: "link",
    label: "LinkedIn",
    url: portfolioLinks.linkedin || "https://www.linkedin.com/",
  },
];
const PORTFOLIO_CONTEXT_PROMPT = `
Portfolio data:
${JSON.stringify(projectsData)}
`;
const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Portfolio AI Backend",
      version: "1.0.0",
      description: "API para chat del portafolio personal",
    },
    servers: [{ url: "http://localhost:4000" }],
    tags: [
      { name: "Health", description: "Estado del servicio" },
      { name: "Chat", description: "Asistente de portafolio" },
    ],
    components: {
      schemas: {
        ChatHistoryItem: {
          type: "object",
          properties: {
            role: { type: "string", enum: ["user", "assistant"] },
            content: { type: "string" },
          },
          required: ["role", "content"],
        },
        ChatRequest: {
          type: "object",
          properties: {
            message: { type: "string", example: "Hola, cuéntame sobre Julián" },
            history: {
              type: "array",
              items: { $ref: "#/components/schemas/ChatHistoryItem" },
            },
          },
          required: ["message"],
        },
        ChatResponse: {
          type: "object",
          properties: {
            reply: { type: "string", example: "Respuesta del asistente" },
            suggestions: {
              type: "array",
              items: { type: "string" },
              example: ["Muéstrame tus proyectos", "¿Qué tecnologías manejas?"],
            },
            actions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", example: "link" },
                  label: { type: "string", example: "GitHub" },
                  url: { type: "string", example: "https://github.com/" },
                },
              },
            },
            contact: {
              type: "object",
              properties: {
                type: { type: "string", example: "whatsapp" },
                url: { type: "string", example: "https://wa.me/573195328292" },
              },
            },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string", example: "chat_error" },
          },
        },
      },
    },
    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          operationId: "HealthController_check",
          summary: "Health check",
          responses: {
            200: {
              description: "Servicio activo",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { ok: { type: "boolean", example: true } },
                  },
                },
              },
            },
          },
        },
      },
      "/api/chat": {
        post: {
          tags: ["Chat"],
          operationId: "ChatController_sendMessage",
          summary: "Enviar mensaje al asistente",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ChatRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Respuesta del asistente",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ChatResponse" },
                },
              },
            },
            400: {
              description: "Body inválido",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            500: {
              description: "Error de chat",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: [],
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/docs.json", (_, res) => res.json(swaggerSpec));

const chatBodySchema = z.object({
  message: z.string().min(1, "message is required"),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      })
    )
    .optional()
    .default([]),
});

app.get("/health", (_, res) => res.json({ ok: true }));

app.post("/api/chat", async (req, res) => {
  try {
    const parseResult = chatBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.issues[0]?.message });
    }

    const historyMessages = parseResult.data.history.map((item) => ({
      role: item.role,
      content: item.content,
    }));

    const contactIntentRegex =
      /(contact|contactar|contacto|whatsapp|wpp|hablar|hablemos|escribirte|llamar|llamada)/i;
    if (contactIntentRegex.test(parseResult.data.message)) {
      return res.json({
        reply: "Puedes escribirme directamente por WhatsApp.",
        suggestions: SUGGESTIONS,
        actions: ACTIONS,
        contact: {
          type: "whatsapp",
          url: WHATSAPP_LINK,
        },
      });
    }

    const messages = [
      { role: "system", content: `${SYSTEM_PROMPT}\n${PORTFOLIO_CONTEXT_PROMPT}` },
      ...historyMessages,
      { role: "user", content: parseResult.data.message },
    ];

    if (AI_PROVIDER === "ollama") {
      const ollamaResponse = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages,
          stream: false,
        }),
      });

      if (!ollamaResponse.ok) {
        const errorBody = await ollamaResponse.text();
        req.log.error(
          {
            status: ollamaResponse.status,
            provider: AI_PROVIDER,
            ollamaBaseUrl: OLLAMA_BASE_URL,
            ollamaModel: OLLAMA_MODEL,
            errorBody,
          },
          "ollama_chat_error"
        );
        return res.status(500).json({ error: "chat_error" });
      }

      const ollamaData = await ollamaResponse.json();
      return res.json({
        reply: ollamaData?.message?.content ?? "",
        suggestions: SUGGESTIONS,
        actions: ACTIONS,
      });
    }

    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "tu_api_key") {
      req.log.error("Invalid OPENAI_API_KEY (missing or placeholder)");
      return res.status(500).json({ error: "chat_error" });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      temperature: 0.4,
    });

    return res.json({
      reply: completion.choices?.[0]?.message?.content ?? "",
      suggestions: SUGGESTIONS,
      actions: ACTIONS,
    });
  } catch (err) {
    req.log.error(
      {
        err,
        provider: AI_PROVIDER,
        openaiStatus: err?.status,
        openaiCode: err?.code,
        openaiType: err?.type,
      },
      "chat_error"
    );
    return res.status(500).json({ error: "chat_error" });
  }
});

export { app };
