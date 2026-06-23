import dotenv from "dotenv";

dotenv.config();

/**
 * Llama a la API de Google Gemini para obtener una respuesta inteligente.
 * 
 * @param {string} message El mensaje actual del usuario.
 * @param {Array<{role: string, content: string}>} history El historial de conversación.
 * @param {string} systemPrompt Instrucciones del sistema (contexto y personalidad).
 * @returns {Promise<string>} La respuesta de la IA.
 */
export async function generateGeminiReply(message, history = [], systemPrompt = "") {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not defined");
  }

  // Model name - we use gemini-2.5-flash which is highly stable and fast
  const modelName = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  // Map history roles to Gemini roles ('user' and 'model')
  const contents = [];
  if (Array.isArray(history)) {
    for (const msg of history) {
      if (msg.role && msg.content) {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }]
        });
      }
    }
  }

  // Append current message
  contents.push({
    role: "user",
    parts: [{ text: message }]
  });

  const payload = {
    contents
  };

  // Add system instruction if provided
  if (systemPrompt) {
    payload.systemInstruction = {
      parts: [{ text: systemPrompt }]
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API returned error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!replyText) {
    throw new Error("Invalid response format from Gemini API");
  }

  return replyText;
}
