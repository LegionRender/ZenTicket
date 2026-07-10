import { getApiUrl, fetchWithAuth } from "./api-client";

export interface AnalyzeTicketParams {
  imageBase64: string;
  mimeType: string;
  personalGeminiKey?: string;
  userId?: string;
  forceTargetedRetry?: boolean;
  connectorId?: string;
}

const MOCK_TICKETS = [
  {
    rfcEmisor: "CCO8605231N4",
    nombreEmisor: "CADENA COMERCIAL OXXO S.A. DE C.V.",
    sucursal: "SUCURSAL REFORMA CENTRO",
    items: [
      { description: "CAFE ANDATTI CAPUCCINO MED", amount: 24.50 },
      { description: "SABRITAS RECETA CRUJIENTE 110G", amount: 36.00 },
      { description: "AGUA PURIFICADA EPURA 1L", amount: 22.00 }
    ]
  },
  {
    rfcEmisor: "NWM9709244W4",
    nombreEmisor: "NUEVA WAL-MART DE MEXICO S. DE R.L. DE C.V.",
    sucursal: "WALMART PORTAL VALLEJO",
    items: [
      { description: "LECHE ENTERA LALA 1L", amount: 27.50 },
      { description: "PAN CERO CERO BIMBO 610G", amount: 56.00 },
      { description: "PECHUGA DE POLLO POR KG", amount: 154.50 },
      { description: "DETG LIQ PERSIL 3L", amount: 151.00 }
    ]
  },
  {
    rfcEmisor: "CSI020226MV4",
    nombreEmisor: "CAFE SIRENA S. DE R.L. DE C.V. (STARBUCKS)",
    sucursal: "STARBUCKS ANGEL DE LA REFORMA",
    items: [
      { description: "CAFE LATTE INTEGRAL GRANDE", amount: 82.00 },
      { description: "CROISSANT DE JAMON Y QUESO", amount: 63.00 }
    ]
  },
  {
    rfcEmisor: "SCC020430V76",
    nombreEmisor: "SERVICIOS COLECTIVOS COSTCO S.A. DE C.V.",
    sucursal: "COSTCO INTERLOMAS",
    items: [
      { description: "PIZZA XL QUESO COSTCO FS", amount: 199.00 },
      { description: "REFRESCO DE COLA LIGHT 12P", amount: 110.00 },
      { description: "DETERGENTE LIQUIDO KIRKLAND 5L", amount: 345.00 }
    ]
  },
  {
    rfcEmisor: "DCO0006276V4",
    nombreEmisor: "DISTRIBUIDORA LIVERPOOL S.A. DE C.V.",
    sucursal: "LIVERPOOL POLANCO",
    items: [
      { description: "PLAYERA DEPORTIVA PREMIUM M", amount: 399.00 },
      { description: "TENIS DE CORRER RUNNING LITE", amount: 1499.00 }
    ]
  }
];

const createMockResponse = (data: any): Response => {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => data,
    text: async () => JSON.stringify(data),
    clone: () => createMockResponse(data),
  } as Response;
};

/**
 * Sends a ticket image (Base64) to the OCR endpoint for analysis and structured data extraction.
 * If backend fails or is not found (e.g., hosted on Vercel), gracefully falls back to local simulation.
 */
export const analyzeTicket = async ({
  imageBase64,
  mimeType,
  personalGeminiKey,
  userId,
  forceTargetedRetry,
  connectorId
}: AnalyzeTicketParams): Promise<Response> => {
  const headers: Record<string, string> = {};
  if (personalGeminiKey) {
    headers["x-gemini-api-key"] = personalGeminiKey;
  }

  try {
    const response = await fetchWithAuth("/api/tickets/analyze", {
      method: "POST",
      headers,
      body: JSON.stringify({
        image: imageBase64,
        mimeType,
        userId,
        forceTargetedRetry,
        connectorId
      }),
    });

    if (response.ok) {
      return response;
    }
    console.warn("Backend OCR returned non-OK status. Activating elegant client-side fallback...");
  } catch (err) {
    console.warn("Backend API endpoint not available. Activating high-fidelity local OCR mock engine...", err);
  }

  // Never invent ticket data when OCR is unavailable. Return an empty manual-capture draft.
  const mockData = {
    rfcEmisor: "",
    nombreEmisor: "",
    sucursal: "",
    fechaCompra: "",
    folio: "",
    total: 0,
    ocrFailed: true,
    ocrError: "El OCR no pudo procesar la imagen. Completa los campos manualmente.",
    items: [],
    cost: 0,
    rawCost: 0
  };

  return createMockResponse(mockData);
};
