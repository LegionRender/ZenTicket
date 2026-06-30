import { resolveValue } from "./resolveValue";
import { createRunnerLog } from "../logging/createRunnerLog";

export interface ExecutionResult {
  success: boolean;
  xmlContent?: string;
  pdfHtml?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Execute portal map navigation (mock/stub for this milestone - no actual Playwright launch).
 * Safely resolves fields and logs execution mapping.
 */
export async function executePortalMap(
  jobId: string,
  ticketId: string,
  portalMap: any,
  connector: any,
  ticketData: any,
  fiscalProfile: any
): Promise<ExecutionResult> {
  await createRunnerLog(jobId, ticketId, "INFO", `Iniciando ejecución de navegación para el conector: ${connector.nombre}`);

  try {
    const fields = JSON.parse(connector.fieldsJson || "[]");
    for (const f of fields) {
      const val = resolveValue(f.key, f.source, ticketData, fiscalProfile);
      await createRunnerLog(
        jobId,
        ticketId,
        "INFO",
        `[MAPPING] Llenando selector "${f.selector}" (${f.name}) con valor "${val}"`
      );
    }

    // Since we are not doing a real Playwright launch yet, we stop here.
    // We cannot download a real XML from a simulator.
    await createRunnerLog(jobId, ticketId, "WARNING", "Playwright runner no está activo de forma completa en este milestone.");
    
    return {
      success: false,
      error: "El motor de Playwright no ha sido iniciado para descargar el XML real.",
      errorCode: "XML_NOT_DOWNLOADED"
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Unknown error during map execution",
      errorCode: "UNKNOWN_RUNNER_ERROR"
    };
  }
}
