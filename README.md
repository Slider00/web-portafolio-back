# portfolio-ai-backend

Backend del chat informativo del portafolio personal.

## Requisitos

- Node.js 20+
- npm 10+

## Configuración

1. Instala dependencias:

```bash
npm install
```

2. Crea tu archivo de entorno:

```bash
cp .env.example .env
```

3. Configura orígenes del frontend en `.env`:

- `FRONTEND_ORIGIN=http://localhost:5173`
- `FRONTEND_ORIGIN_PROD=https://tu-dominio.vercel.app`

## Scripts

| Script | Comando | ¿Qué hace? |
|---|---|---|
| `dev` | `npm run dev` | Inicia el servidor en modo desarrollo con recarga automática. |
| `start` | `npm run start` | Inicia el servidor en modo normal. |
| `test` | `npm run test` | Ejecuta pruebas con Vitest y cobertura. |
| `test:watch` | `npm run test:watch` | Ejecuta pruebas en modo watch. |
| `lint` | `npm run lint` | Analiza el código con ESLint. |
| `lint:fix` | `npm run lint:fix` | Corrige problemas de lint automáticamente. |
| `format` | `npm run format` | Verifica formato con Prettier. |
| `format:write` | `npm run format:write` | Aplica formato con Prettier. |

## Endpoints

- `GET /health`: estado del servicio.
- `POST /api/chat`: chat informativo del portafolio.

Body esperado:

```json
{
  "message": "texto del usuario",
  "history": [{ "role": "user|assistant", "content": "..." }]
}
```

Respuesta:

```json
{
  "reply": "...",
  "suggestions": ["..."],
  "actions": [{ "type": "link", "label": "...", "url": "..." }],
  "contact": { "type": "whatsapp", "url": "..." }
}
```

## Datos del chat

El contenido de respuestas se toma de:

- `src/data/projects.json`

## Swagger

- UI: `http://localhost:4000/docs`
- JSON: `http://localhost:4000/docs.json`

## Deploy en Vercel

Este proyecto incluye:

- entrypoint serverless en `api/index.js`
- rewrites en `vercel.json`

Variables recomendadas en Vercel:

- `FRONTEND_ORIGIN=http://localhost:5173`
- `FRONTEND_ORIGIN_PROD=https://tu-frontend.vercel.app`
