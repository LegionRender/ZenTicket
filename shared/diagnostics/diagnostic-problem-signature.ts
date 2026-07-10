export const buildProblemSignature = (
  connectorId: string | null | undefined,
  failedStage: string | null | undefined,
  portalMessage: string | null | undefined,
  missingArtifact: string | null | undefined,
  errorCode: string | null | undefined
): string => {
  const cId = (connectorId || "unknown").toLowerCase().trim();
  const fStage = (failedStage || "unknown").toLowerCase().trim();
  
  let msgPattern = "none";
  if (portalMessage) {
    const m = portalMessage.toLowerCase();
    if (m.includes("ya fue facturado") || m.includes("ya se encuentra facturado") || m.includes("ya emitido") || m.includes("ya fue emitido")) {
      msgPattern = "already_invoiced";
    } else if (m.includes("captcha") || m.includes("código de seguridad")) {
      msgPattern = "captcha_error";
    } else if (m.includes("inexistente") || m.includes("no existe") || m.includes("no encontrado")) {
      msgPattern = "ticket_not_found";
    } else {
      msgPattern = portalMessage.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30);
    }
  }

  const art = (missingArtifact || "none").toLowerCase().trim();
  const code = (errorCode || "none").toLowerCase().trim();

  return `${cId}::${fStage}::${msgPattern}::${art}::${code}`;
};
