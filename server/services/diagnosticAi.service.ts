import { GoogleGenAI } from "@google/genai";
import { sanitizeRunnerDiagnostic } from "../../shared/diagnostics/diagnostic-sanitizer";
import { SYSTEM_AI_PROMPT } from "../../shared/diagnostics/diagnostic-ai-prompt";

export class DiagnosticAiService {
  async generateDiagnosticFixProposal(params: any): Promise<any> {
    if (process.env.GEMINI_DIAGNOSTIC_ENABLED !== "true") {
      throw new Error("GEMINI_DIAGNOSTIC_DISABLED");
    }

    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey || apiKey.length < 20) {
      throw new Error("GEMINI_API_KEY_NOT_CONFIGURED");
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const temperature = parseFloat(process.env.GEMINI_TEMPERATURE || "0.2");
    const maxOutputTokens = parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || "2048", 10);

    // Sanitization input data before prompt construction
    const sanitizedParams = sanitizeRunnerDiagnostic(params);

    const userPrompt = `
Analiza la siguiente incidencia de facturación sanitizada y proporciona una propuesta técnica detallada en JSON.

DATOS TÉCNICOS:
- Ticket ID: ${sanitizedParams.ticketId || ""}
- Connector ID: ${sanitizedParams.connectorId || ""}
- Affected Portal: ${sanitizedParams.affectedPortal || ""}
- Canonical Status: ${sanitizedParams.canonicalStatus || ""}
- Failed Stage: ${sanitizedParams.failedStage || ""}
- Problem Signature: ${sanitizedParams.problemSignature || ""}
- Normalized Fields: ${JSON.stringify(sanitizedParams.normalizedFields || {})}
- Portal Snapshot: ${JSON.stringify(sanitizedParams.portalSnapshot || {})}
- Runner Error Code: ${sanitizedParams.runnerErrorCode || ""}
- Portal Message: ${sanitizedParams.portalMessage || ""}
- Missing Artifacts: ${JSON.stringify(sanitizedParams.missingArtifacts || [])}
- Technical Message: ${sanitizedParams.technicalMessage || ""}
`;

    // Response Schema structure for responseSchema config
    const responseSchema = {
      type: "OBJECT",
      properties: {
        summary: { type: "STRING" },
        plainLanguageProblem: { type: "STRING" },
        stoppedAtStage: { type: "STRING" },
        likelyCause: { type: "STRING" },
        portalSpecificObservations: { type: "ARRAY", items: { type: "STRING" } },
        suggestedFix: { type: "STRING" },
        recommendedActions: { type: "ARRAY", items: { type: "STRING" } },
        proposedConnectorChanges: {
          type: "OBJECT",
          properties: {
            connectorId: { type: "STRING" },
            type: {
              type: "STRING",
              enum: [
                "field_mapping",
                "recovery_flow",
                "selector_update",
                "captcha_flow",
                "download_detection",
                "error_classifier",
                "jit_learning_rule"
              ]
            },
            description: { type: "STRING" },
            riskLevel: { type: "STRING", enum: ["low", "medium", "high"] },
            filesLikelyAffected: { type: "ARRAY", items: { type: "STRING" } },
            pseudoPatch: { type: "STRING" },
            testPlan: { type: "ARRAY", items: { type: "STRING" } }
          },
          required: ["connectorId", "type", "description", "riskLevel", "filesLikelyAffected", "testPlan"]
        },
        recoveryFlowProposal: {
          type: "OBJECT",
          properties: {
            steps: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  action: {
                    type: "STRING",
                    enum: ["click", "fill", "waitForText", "download", "navigate", "extract", "validate"]
                  },
                  target: { type: "STRING" },
                  value: { type: "STRING" },
                  expectedResult: { type: "STRING" }
                },
                required: ["action", "target", "expectedResult"]
              }
            }
          },
          required: ["steps"]
        },
        confidence: { type: "NUMBER" },
        requiresHumanReview: { type: "BOOLEAN" },
        forbiddenActionsDetected: { type: "ARRAY", items: { type: "STRING" } }
      },
      required: [
        "summary",
        "plainLanguageProblem",
        "stoppedAtStage",
        "likelyCause",
        "portalSpecificObservations",
        "suggestedFix",
        "recommendedActions",
        "proposedConnectorChanges",
        "confidence",
        "requiresHumanReview",
        "forbiddenActionsDetected"
      ]
    };

    const response = await ai.models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_AI_PROMPT,
        temperature,
        maxOutputTokens,
        responseMimeType: "application/json",
        responseSchema: responseSchema as any
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("EMPTY_GEMINI_RESPONSE");
    }

    try {
      const parsed = JSON.parse(responseText);
      return parsed;
    } catch (e) {
      console.error("Failed to parse Gemini response text:", responseText);
      throw new Error("INVALID_JSON_RESPONSE");
    }
  }
}

export const diagnosticAiService = new DiagnosticAiService();
