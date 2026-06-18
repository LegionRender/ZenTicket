import { getGeminiClient } from "../gemini/client";
import { getLocalConnectorFallback, getLocalDictionaryMatch } from "./localConnectorSpecs";

interface LearnConnectorInput {
  nombreEmisor: string;
  rfcEmisor?: string;
  learnedFrom?: string;
  tokenSaver?: boolean | string;
  customKey?: string;
}

const connectorResponseSchema = {
  type: "OBJECT",
  properties: {
    portalUrl: { type: "STRING" },
    fields: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          key: { type: "STRING" },
          name: { type: "STRING" },
          selector: { type: "STRING" },
          type: { type: "STRING" },
          required: { type: "BOOLEAN" },
        },
        required: ["key", "name", "selector", "type", "required"],
      },
    },
    steps: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
  },
  required: ["portalUrl", "fields", "steps"],
};

function calculateTokenCost(promptTokens: number, outputTokens: number, includesGrounding = false) {
  const exchangeRate = 18.50;
  const groundingCost = includesGrounding ? 0.01 : 0;
  return (((promptTokens * 0.075 + outputTokens * 0.30) / 1000000) + groundingCost) * exchangeRate;
}

async function learnConnectorEco(ai: any, nombreEmisor: string, rfcEmisor: string | undefined, learnedFrom: string | undefined) {
  console.log(`[Learn] Token-Saver (ECO) Mode active. Formulating fast offline AI mapping...`);

  const prompt = `Queremos automatizar de forma ultra-simplificada el proceso de facturaciÃ³n de tickets de la empresa mexicana '${nombreEmisor}' con RFC '${rfcEmisor || "No provisto"}'.
                  BasÃ¡ndote EN TU CONOCIMIENTO INTERNO (sin buscar en Google), genera la especificaciÃ³n estructurada estÃ¡ndar: determina de 2 a 3 campos requeridos clave para buscar el ticket y describe un flujo secuencial simplificado de mÃ¡ximo 4 pasos cortos.
                  Usa selectores CSS intuitivos y genÃ©ricos (como #txtTicket, input[name='rfc']). SÃ‰ ABSOLUTAMENTE CONCISO Y LIMITA EL LARGO DEL TEXTO PARA AHORRAR TOKENS.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: "LOW" },
      responseMimeType: "application/json",
      responseSchema: connectorResponseSchema,
    },
  });

  const textResult = response.text;
  if (!textResult) {
    throw new Error("Empty ECO response from Gemini");
  }

  const promptTokens = response.usageMetadata?.promptTokenCount || 400;
  const outputTokens = response.usageMetadata?.candidatesTokenCount || 200;
  const rawCost = calculateTokenCost(promptTokens, outputTokens);
  const learnedSpecs = JSON.parse(textResult.trim());

  return {
    ...learnedSpecs,
    cost: learnedFrom === "portal_admin" ? 12.00 : 8.00,
    rawCost: parseFloat(rawCost.toFixed(6)),
    isEco: true,
  };
}

async function learnConnectorDeep(ai: any, nombreEmisor: string, rfcEmisor: string | undefined, learnedFrom: string | undefined) {
  console.log("[Learn] Deep Mode active. Attempting to find connector details using Search Grounding + LOW reasoning...");

  const prompt = `Queremos automatizar el proceso de facturaciÃ³n de tickets de la empresa mexicana '${nombreEmisor}' con RFC '${rfcEmisor || "No provisto"}'.
                  Utilizando Google Search, busca el link directo al portal oficial de autofacturaciÃ³n de tickets para clientes en MÃ©xico.
                  Genera la especificaciÃ³n del conector: determina quÃ© campos requiere el formulario para buscar el ticket e inventa selectores CSS realistas y de 4 a 5 pasos secuenciales cortos.
                  POR FAVOR SÃ‰ EXTREMADAMENTE CONCISO: Genera nombres de campos cortos, selectores limpios y descripciones de pasos directas (mÃ¡ximo 12 palabras por instrucciÃ³n) para reducir significativamente la generaciÃ³n de tokens.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: { thinkingLevel: "LOW" },
      responseMimeType: "application/json",
      responseSchema: {
        ...connectorResponseSchema,
        properties: {
          ...connectorResponseSchema.properties,
          portalUrl: { type: "STRING", description: "URL oficial directo al portal en MÃ©xico" },
        },
      },
    },
  });

  const textResult = response.text;
  if (!textResult) {
    throw new Error("Empty search response from Gemini");
  }

  const promptTokens = response.usageMetadata?.promptTokenCount || 1000;
  const outputTokens = response.usageMetadata?.candidatesTokenCount || 400;
  const rawCost = calculateTokenCost(promptTokens, outputTokens, true);
  const learnedSpecs = JSON.parse(textResult.trim());

  return {
    ...learnedSpecs,
    cost: learnedFrom === "portal_admin" ? 25.00 : 15.00,
    rawCost: parseFloat(rawCost.toFixed(6)),
  };
}

async function learnConnectorPureLlmFallback(ai: any, nombreEmisor: string, rfcEmisor: string | undefined, learnedFrom: string | undefined) {
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: `Queremos automatizar el proceso de facturaciÃ³n de tickets de la empresa mexicana '${nombreEmisor}' con RFC '${rfcEmisor || "No provisto"}'.
              Genera la especificaciÃ³n simplificada y muy concisa del conector basada en tu conocimiento: determina de 2 a 3 campos requeridos (ej: folio, fecha, total, RFC) e inventa selectores CSS realistas (como #txtTicket, input[name='rfc']) y detalla de 3 a 4 pasos secuenciales muy cortos para un script de automatizaciÃ³n. Evita palabras innecesarias para ahorrar tokens.`,
    config: {
      thinkingConfig: { thinkingLevel: "LOW" },
      responseMimeType: "application/json",
      responseSchema: connectorResponseSchema,
    },
  });

  const textResult = response.text;
  if (!textResult) {
    throw new Error("Empty pure LLM response");
  }

  const promptTokens = response.usageMetadata?.promptTokenCount || 500;
  const outputTokens = response.usageMetadata?.candidatesTokenCount || 250;
  const rawCost = calculateTokenCost(promptTokens, outputTokens);
  const learnedSpecs = JSON.parse(textResult.trim());

  return {
    ...learnedSpecs,
    cost: learnedFrom === "portal_admin" ? 18.00 : 12.00,
    rawCost: parseFloat(rawCost.toFixed(6)),
  };
}

function getLocalFallbackResponse(nombreEmisor: string, rfcEmisor: string | undefined, learnedFrom: string | undefined) {
  const fallbackSpecs = getLocalConnectorFallback(nombreEmisor, rfcEmisor || "");
  return {
    ...fallbackSpecs,
    cost: learnedFrom === "portal_admin" ? 25.00 : 15.00,
    rawCost: 0,
  };
}

export async function learnConnectorSpecs({
  nombreEmisor,
  rfcEmisor,
  learnedFrom,
  tokenSaver,
  customKey,
}: LearnConnectorInput) {
  const dictMatch = getLocalDictionaryMatch(nombreEmisor, rfcEmisor || "");
  if (dictMatch) {
    console.log(`[Learn] Fast match in local dictionary for '${nombreEmisor}'. Zero-token cached specs returned.`);
    return {
      ...dictMatch,
      cost: learnedFrom === "portal_admin" ? 5.00 : 3.00,
      rawCost: 0,
      isCached: true,
    };
  }

  let ai;
  try {
    ai = getGeminiClient(customKey);
  } catch (err: any) {
    console.warn("Gemini client not initialized, using local fallback specs.");
    return getLocalFallbackResponse(nombreEmisor, rfcEmisor, learnedFrom);
  }

  const isEcoMode = tokenSaver === true || tokenSaver === "true";

  try {
    if (isEcoMode) {
      return await learnConnectorEco(ai, nombreEmisor, rfcEmisor, learnedFrom);
    }

    return await learnConnectorDeep(ai, nombreEmisor, rfcEmisor, learnedFrom);
  } catch (searchError: any) {
    console.warn("[Learn] Optimized path failed. Falling back to pure text based LLM...", searchError.message || searchError);

    try {
      return await learnConnectorPureLlmFallback(ai, nombreEmisor, rfcEmisor, learnedFrom);
    } catch (pureLlmError: any) {
      console.error("[Learn] Pure LLM failed too. Utilizing Rule-Based Heuristic Fallback.", pureLlmError.message || pureLlmError);
      return getLocalFallbackResponse(nombreEmisor, rfcEmisor, learnedFrom);
    }
  }
}
