import dotenvSafe from "dotenv-safe";
import { app } from "./app.js";

dotenvSafe.config();

const port = Number(process.env.PORT || 4000);
const provider = process.env.AI_PROVIDER || "ollama";

if (provider === "openai" && (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "tu_api_key")) {
  console.error(
    "Invalid OPENAI_API_KEY in .env (missing or placeholder). /api/chat will return 500 chat_error."
  );
}

if (provider === "ollama") {
  console.log(
    `AI provider: ollama (${process.env.OLLAMA_MODEL || "llama3.1:8b"}) at ${
      process.env.OLLAMA_BASE_URL || "http://localhost:11434"
    }`
  );
}

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
