# portfolio-ai-backend

Backend API para el portafolio con endpoint de chat y endpoint de salud.

## Requisitos

- Node.js 20+
- npm 10+

## Configuración

1. Instala dependencias:

```bash
npm install
```

2. Crea tu archivo de entorno desde el ejemplo:

```bash
cp .env.example .env
```

3. Configura proveedor de IA en `.env`:
   - Gratis local (recomendado): `AI_PROVIDER=ollama`
   - OpenAI (cuando quieras activarlo): `AI_PROVIDER=openai`
4. Define los orígenes del frontend:
   - `FRONTEND_ORIGIN=http://localhost:5173`
   - `FRONTEND_ORIGIN_PROD=https://tu-dominio.vercel.app`

Variables para Ollama:

- `OLLAMA_BASE_URL=http://localhost:11434`
- `OLLAMA_MODEL=llama3.1:8b`

Variables para OpenAI:

- `OPENAI_API_KEY=sk-...`

## Scripts

| Script | Comando | ¿Qué hace? |
|---|---|---|
| `dev` | `npm run dev` | Inicia el servidor en modo desarrollo con recarga automática al cambiar archivos. |
| `start` | `npm run start` | Inicia el servidor en modo normal (sin watch), útil para correr en producción/local estable. |
| `test` | `npm run test` | Ejecuta pruebas con Vitest y genera reporte de cobertura. |
| `test:watch` | `npm run test:watch` | Ejecuta pruebas en modo watch (re-ejecuta al detectar cambios). |
| `lint` | `npm run lint` | Analiza el código con ESLint para detectar errores y malas prácticas. |
| `lint:fix` | `npm run lint:fix` | Corrige automáticamente problemas de lint que se pueden arreglar solos. |
| `format` | `npm run format` | Verifica si el formato del código cumple las reglas de Prettier. |
| `format:write` | `npm run format:write` | Aplica automáticamente el formato de Prettier a los archivos. |
| `prepare` | `npm run prepare` | Inicializa Husky para habilitar hooks de Git. |
| `precommit:check` | `npm run precommit:check` | Ejecuta validaciones previas al commit (`lint` + `test`). |

## Arquitectura del proyecto

Estructura actual:

```text
.
├── src/
│   ├── app.js
│   └── server.js
├── test/
│   └── health.test.js
├── .env.example
└── README.md
```

Responsabilidades:

- `src/app.js`: define la aplicación Express (middlewares, rutas, validaciones, manejo de errores).
- `src/server.js`: punto de arranque del servidor (`listen`) y carga de variables de entorno.
- `test/*.test.js`: pruebas automatizadas (unitarias/integración ligera de endpoints).

Regla práctica:

- `app.js` no debe arrancar puertos.
- `server.js` no debe contener lógica de negocio.
- Esto permite probar `app` sin acoplar tests al proceso del servidor.

Cómo escalar por módulos:

- Crear carpetas por dominio dentro de `src/modules`, por ejemplo:
  - `src/modules/chat/chat.routes.js`
  - `src/modules/chat/chat.controller.js`
  - `src/modules/chat/chat.service.js`
  - `src/modules/chat/chat.schema.js`
- Mantener utilidades transversales en `src/shared` (logger, middlewares, errores, helpers).

## Endpoints

- `GET /health`: estado del servicio.
- `POST /api/chat`: endpoint de chat.

## Swagger

- UI: `http://localhost:4000/docs`
- JSON OpenAPI: `http://localhost:4000/docs.json`

Con el backend corriendo (`npm run dev`), abre `/docs` en el navegador para visualizar y probar los servicios.

## Ollama (gratis local)

Para Mac M3 con 16GB RAM, recomendado comenzar con `llama3.1:8b`.

1. Instalar y levantar Ollama:

```bash
brew install ollama
ollama serve
```

2. Descargar modelo:

```bash
ollama pull llama3.1:8b
```

3. Verifica que `.env` tenga:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
```

4. Inicia backend:

```bash
npm run dev
```

## Flujo recomendado

Antes de hacer commit:

```bash
npm run lint
npm run test
```

Para desarrollo diario:

```bash
npm run dev
```
