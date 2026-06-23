import cors from "cors";
import express from "express";
import { readFileSync } from "node:fs";
import helmet from "helmet";
import { connectDB } from "./lib/db.js";
import { Testimonial } from "./models/testimonial.model.js";
import pinoHttp from "pino-http";
import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { generateGeminiReply } from "./lib/gemini.js";

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
app.options("/{*path}", cors());

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

const TESTIMONIALS_FILE_URL = new URL("./data/testimonials.json", import.meta.url);
let testimonialsData = [];
try {
  testimonialsData = JSON.parse(readFileSync(TESTIMONIALS_FILE_URL, "utf-8"));
} catch (error) {
  console.error("Could not load src/data/testimonials.json, using empty array.", error);
}

const seedTestimonialsIfEmpty = async () => {
  try {
    const count = await Testimonial.countDocuments();
    if (count === 0 && testimonialsData.length > 0) {
      console.log("Testimonial collection is empty. Seeding with default data...");
      await Testimonial.insertMany(testimonialsData);
    }
  } catch (error) {
    console.error("Could not seed testimonials:", error);
  }
};
const SUGGESTIONS = [
  "Show me your projects",
  "What technologies do you use?",
  "Tell me about your experience",
  "I want to contact you",
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
      { name: "Testimonials", description: "Testimonios y comentarios de clientes" },
    ],
    components: {
      schemas: {
        TestimonialRequest: {
          type: "object",
          properties: {
            name: { type: "string", example: "Tesla" },
            username: { type: "string", example: "@tesla" },
            body: { type: "string", example: "Excelente servicio y atención." },
            img: { type: "string", example: "https://robohash.org/Tesla" },
          },
          required: ["name", "body"],
        },
        TestimonialResponse: {
          type: "object",
          properties: {
            name: { type: "string", example: "Tesla" },
            username: { type: "string", example: "@tesla" },
            body: { type: "string", example: "Excelente servicio y atención." },
            img: { type: "string", example: "https://robohash.org/Tesla" },
          },
          required: ["name", "username", "body", "img"],
        },
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
      "/api/testimonials": {
        get: {
          tags: ["Testimonials"],
          summary: "Obtener lista de testimonios",
          responses: {
            200: {
              description: "Lista de testimonios obtenida correctamente",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/TestimonialResponse" },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ["Testimonials"],
          summary: "Crear un nuevo testimonio",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TestimonialRequest" },
              },
            },
          },
          responses: {
            201: {
              description: "Testimonio creado correctamente",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TestimonialResponse" },
                },
              },
            },
            400: {
              description: "Datos de entrada inválidos",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
            500: {
              description: "Error interno del servidor",
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

const testimonialBodySchema = z.object({
  name: z.string().min(1, "name is required"),
  username: z.string().optional().default("@anonimo"),
  body: z.string().min(1, "body is required"),
  img: z.string().optional(),
});

app.get("/health", (_, res) => res.json({ ok: true }));

app.get("/api/testimonials", async (req, res) => {
  try {
    await connectDB();
    await seedTestimonialsIfEmpty();
    const list = await Testimonial.find().sort({ createdAt: -1 });
    return res.json(list);
  } catch (err) {
    req.log.error(err, "testimonials_get_error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/testimonials", async (req, res) => {
  try {
    const parseResult = testimonialBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.issues[0]?.message });
    }

    await connectDB();

    const { name, username, body, img } = parseResult.data;

    let formattedUsername = username ? username.trim() : "@anonimo";
    if (formattedUsername !== "@anonimo" && !formattedUsername.startsWith("@")) {
      formattedUsername = `@${formattedUsername}`;
    }

    const finalImg =
      img || `https://robohash.org/${encodeURIComponent(name.trim())}?size=100x100`;

    const newTestimonial = await Testimonial.create({
      name: name.trim(),
      username: formattedUsername,
      body: body.trim(),
      img: finalImg,
    });

    return res.status(201).json(newTestimonial);
  } catch (err) {
    req.log.error(err, "testimonials_post_error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

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
        reply: "You can contact me directly on WhatsApp.",
        suggestions: SUGGESTIONS,
        actions: ACTIONS,
        contact: {
          type: "whatsapp",
          url: WHATSAPP_LINK,
        },
      });
    }

    let reply;
    if (process.env.GEMINI_API_KEY) {
      try {
        const dynamicSystemPrompt = `
You are Julian Correa's portfolio AI assistant. 
Answer questions based on his profile, projects, skills, experience, and contact links provided below.
Be concise, clear, helpful, and professional. Respond in the same language as the user's message (mostly Spanish or English).

If the user asks about projects, skills, or experience, use the context provided.
If the information is not in the context, politely state that you do not know or that you cannot answer that specific question, but offer to direct them to his contact links.

Here is the structured profile context:
${JSON.stringify(projectsData, null, 2)}
`;
        reply = await generateGeminiReply(parseResult.data.message, historyMessages, dynamicSystemPrompt);
      } catch (geminiErr) {
        req.log.error(geminiErr, "gemini_api_error_falling_back_to_generic_message");
        reply = "Sorry, my smart assistant service is experiencing technical issues right now. Feel free to contact me directly on WhatsApp using the button below.";
      }
    } else {
      reply = "Sorry, the AI assistant service is not configured at this time. Please try again later or reach out via my social links.";
    }

    return res.json({
      reply,
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

export { app };
export default app;
