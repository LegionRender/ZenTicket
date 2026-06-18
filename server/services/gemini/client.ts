import { GoogleGenAI } from "@google/genai";

export function getGeminiClient(customApiKey?: string): GoogleGenAI {
  const currentKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!currentKey) {
    throw new Error("La clave GEMINI_API_KEY no esta configurada. Agregala en Settings > Secrets de AI Studio o define tu API Key personal en tu Perfil.");
  }
  return new GoogleGenAI({
    apiKey: currentKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

