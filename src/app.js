import cors from "cors";
import express from "express";
import { readFileSync } from "node:fs";
import helmet from "helmet";
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
app.options("*", cors());

const SYSTEM_PROMPT = `
You are Julian Correa's portfolio assistant.
Answer based on his profile, projects, skills and experience.
Be concise, clear, professional. If data is unknown, say so.
`;
const WHATSAPP_NUMBER = "573195328292";
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;
const PROJECTS_FILE_URL = new URL("./data/projects.json", import.meta.url);
let projectsData = {
  profile: { name: "Julian Correa", role: "Software Developer", summary: "" },
  skills: [],
  projects: [],
  links: {},
};
try {
  projectsData = JSON.parse(readFileSync(PROJECTS_FILE_URL, "utf-8"));
} catch (error) {
  console.error("Could not load src/data/projects.json, using fallback mock context.", error);
}
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
const buildMockReply = (message) => {
  const msg = message.toLowerCase();
  const normalized = msg.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const projectNames = (projectsData.projects || []).map((p) => p.name).filter(Boolean);
  const skills = (projectsData.skills || []).filter(Boolean);
  const role = projectsData.profile?.role || "Software Developer";
  const summary = projectsData.profile?.summary || "";
  const name = projectsData.profile?.name || "Julian Correa";
  const experience = projectsData.experience || [];

  if (/^(\s)*(hola|hello|hi|buenas|hey)\b/.test(normalized)) {
    return `Hola, soy el asistente del portafolio de ${name}. Te puedo contar sobre proyectos, tecnologías y experiencia.`;
  }

  if (/quien eres|who are you|que eres|about you|sobre ti/.test(normalized)) {
    return `Soy el asistente del portafolio de ${name}. ${role}. ${summary}`.trim();
  }

  if (/proyecto|project|portafolio|portfolio/.test(normalized)) {
    if (projectNames.length === 0) {
      return "Actualmente no tengo proyectos cargados en el contexto.";
    }
    const topProjects = projectNames.slice(0, 5).join(", ");
    return `Estos son algunos proyectos destacados: ${topProjects}. Si quieres, te detallo uno en particular.`;
  }

  const matchedProject = (projectsData.projects || []).find((project) => {
    const nameMatch = project.name?.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    return nameMatch && normalized.includes(nameMatch);
  });
  if (matchedProject) {
    const stack = (matchedProject.stack || []).join(", ");
    return `${matchedProject.name}: ${matchedProject.description}${
      stack ? ` Stack: ${stack}.` : ""
    }`;
  }

  if (/tecnolog|stack|habilidad|skill|tecnic|tools/.test(normalized)) {
    if (skills.length === 0) {
      return "Aún no tengo habilidades cargadas en el contexto.";
    }
    return `Trabajo principalmente con: ${skills.slice(0, 12).join(", ")}.`;
  }

  if (/experien|perfil profesional|trayectoria|career|work experience/.test(normalized)) {
    if (experience.length === 0) {
      return `${role}. ${summary}`.trim();
    }
    const latest = experience[experience.length - 1];
    return `Experiencia reciente: ${latest.title} en ${latest.company} (${latest.date}).`;
  }

  if (/github/.test(normalized)) {
    return `Puedes ver mis repositorios aquí: ${portfolioLinks.github || "https://github.com/"}`;
  }

  if (/linkedin/.test(normalized)) {
    return `Puedes ver mi perfil de LinkedIn aquí: ${
      portfolioLinks.linkedin || "https://www.linkedin.com/"
    }`;
  }

  if (/cv|resume|hoja de vida/.test(normalized)) {
    if (portfolioLinks.cv_en || portfolioLinks.cv_es) {
      return `Puedes revisar mi CV aquí: ${portfolioLinks.cv_en || portfolioLinks.cv_es}`;
    }
    return "Puedo compartirte mi CV si me lo pides por WhatsApp o LinkedIn.";
  }

  return `Puedo ayudarte con información sobre ${name}: proyectos, stack, experiencia y contacto.`;
};
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

    return res.json({
      reply: buildMockReply(parseResult.data.message),
      suggestions: SUGGESTIONS,
      actions: ACTIONS,
    });
  } catch (err) {
    req.log.error(
      {
        err,
        systemPrompt: SYSTEM_PROMPT,
      },
      "chat_error"
    );
    return res.status(500).json({ error: "chat_error" });
  }
});

const handler = (req, res) => app(req, res);

export { app, handler };
export default handler;
