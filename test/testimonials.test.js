import request from "supertest";
import { describe, expect, it, vi } from "vitest";

// Mock del helper de base de datos para evitar conexiones reales en los tests
vi.mock("../src/lib/db.js", () => ({
  connectDB: vi.fn().mockResolvedValue(true),
}));

// Mock del modelo Mongoose para simular consultas y creaciones
vi.mock("../src/models/testimonial.model.js", () => {
  const mockTestimonialsList = [
    {
      name: "Jack",
      username: "@jack",
      body: "Amazing. I love it.",
      img: "https://robohash.org/jack",
    },
    {
      name: "Jill",
      username: "@jill",
      body: "Speechless. This is amazing.",
      img: "https://robohash.org/jill",
    },
  ];

  return {
    Testimonial: {
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockResolvedValue(mockTestimonialsList),
      }),
      countDocuments: vi.fn().mockResolvedValue(mockTestimonialsList.length),
      create: vi.fn().mockImplementation((data) => {
        return Promise.resolve({
          ...data,
          username: data.username.startsWith("@") ? data.username : `@${data.username}`,
          img: data.img || `https://robohash.org/${encodeURIComponent(data.name)}?size=100x100`,
        });
      }),
    },
  };
});

// Importamos app después de definir los mocks de módulo
import { app } from "../src/app.js";

describe("Testimonials API Endpoints (Mocked DB)", () => {
  describe("GET /api/testimonials", () => {
    it("should return the list of testimonials", async () => {
      const response = await request(app).get("/api/testimonials");
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0].name).toBe("Jack");
    });
  });

  describe("POST /api/testimonials", () => {
    it("should create a new testimonial with valid payload", async () => {
      const payload = {
        name: "Empresa de Prueba",
        username: "prueba",
        body: "Este es un comentario excelente.",
        img: "https://robohash.org/testimg",
      };

      const response = await request(app).post("/api/testimonials").send(payload);

      expect(response.status).toBe(201);
      expect(response.body.name).toBe("Empresa de Prueba");
      expect(response.body.username).toBe("@prueba");
      expect(response.body.body).toBe("Este es un comentario excelente.");
      expect(response.body.img).toBe("https://robohash.org/testimg");
    });

    it("should create a new testimonial and generate a default username and image if missing", async () => {
      const payload = {
        name: "Carlos Gomez",
        body: "Muy buen trabajo.",
      };

      const response = await request(app).post("/api/testimonials").send(payload);

      expect(response.status).toBe(201);
      expect(response.body.name).toBe("Carlos Gomez");
      expect(response.body.username).toBe("@anonimo");
      expect(response.body.img).toContain("https://robohash.org/");
    });

    it("should return 400 bad request if name is missing", async () => {
      const payload = {
        body: "Falta el nombre",
      };

      const response = await request(app).post("/api/testimonials").send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it("should return 400 bad request if body is missing", async () => {
      const payload = {
        name: "Carlos",
      };

      const response = await request(app).post("/api/testimonials").send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
  });
});
