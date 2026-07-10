import { getFirestore } from "firebase-admin/firestore";

let activeJobId: string | null = null;
let activeTicketId: string | null = null;
let activeConnectorId: string | null = null;
let activeEnvironment: string | null = null;
let activeUserId: string | null = null;
let activePortalMapId: string | null = null;
let activeStage: string | null = null;

export function setActiveJobContext(
  jobId: string | null,
  ticketId: string | null,
  connectorId: string | null,
  environment: string | null,
  userId?: string | null,
  portalMapId?: string | null
) {
  activeJobId = jobId;
  activeTicketId = ticketId;
  activeConnectorId = connectorId;
  activeEnvironment = environment;
  activeUserId = userId || null;
  activePortalMapId = portalMapId || null;
}

export function setActiveStage(stage: string | null) {
  activeStage = stage;
}

function sanitizeSensitiveData(text: string): string {
  if (!text) return text;
  // Mask Stripe keys
  let sanitized = text.replace(/sk_(?:live|test)_[a-zA-Z0-9]+/g, "sk_***");
  // Mask Firebase keys
  sanitized = sanitized.replace(/AIzaSy[a-zA-Z0-9_-]+/g, "AIzaSy***");
  // Mask XML content
  if (sanitized.includes("<cfdi:") || sanitized.includes("<Comprobante")) {
    sanitized = "[XML COMPACTADO POR SEGURIDAD]";
  }
  return sanitized;
}

function sanitizeObject(obj: any): any {
  if (!obj || typeof obj !== "object") {
    if (typeof obj === "string") return sanitizeSensitiveData(obj);
    return obj;
  }
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  
  const sanitized: any = {};
  for (const key of Object.keys(obj)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("xml") ||
      lowerKey.includes("pdf") ||
      lowerKey.includes("password") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("key")
    ) {
      sanitized[key] = "[SENSITIVO ENMASCARADO]";
    } else if (lowerKey === "rfc" || lowerKey === "rfcemisor" || lowerKey === "rfcreceptor") {
      const val = obj[key];
      if (typeof val === "string" && val.length >= 4) {
        sanitized[key] = val.substring(0, 4) + "***";
      } else {
        sanitized[key] = "***";
      }
    } else {
      sanitized[key] = sanitizeObject(obj[key]);
    }
  }
  return sanitized;
}

function cleanUndefined(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(cleanUndefined).filter(item => item !== undefined);
  const clean: any = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined) {
      clean[key] = typeof val === "object" && val !== null ? cleanUndefined(val) : val;
    }
  }
  return clean;
}

export async function createRunnerLog(
  jobId: string,
  ticketId: string,
  level: "INFO" | "WARNING" | "ERROR",
  message: string,
  metadata?: any
) {
  const db = getFirestore("ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee");
  const logRef = db.collection("runner_logs").doc();
  const timestamp = new Date().toISOString();

  const payload: any = {
    jobId,
    ticketId,
    level,
    message: sanitizeSensitiveData(message),
    timestamp,
    createdAt: timestamp
  };

  // Inject context details if active or provided
  if (metadata?.userId) payload.userId = metadata.userId;
  else if (activeUserId) payload.userId = activeUserId;

  if (metadata?.connectorId) payload.connectorId = metadata.connectorId;
  else if (activeJobId === jobId && activeConnectorId) payload.connectorId = activeConnectorId;

  if (metadata?.portalMapId) payload.portalMapId = metadata.portalMapId;
  else if (activeJobId === jobId && activePortalMapId) payload.portalMapId = activePortalMapId;

  if (metadata?.stage) payload.stage = metadata.stage;
  else if (activeStage) payload.stage = activeStage;

  if (metadata?.errorCode) payload.errorCode = metadata.errorCode;
  else if (metadata?.code) payload.errorCode = metadata.code;

  if (metadata?.retryable !== undefined) payload.retryable = metadata.retryable;
  if (metadata?.blocking !== undefined) payload.blocking = metadata.blocking;

  if (activeEnvironment) {
    payload.environment = activeEnvironment;
  }

  // Sanitize and attach metadata
  if (metadata) {
    const sanitizedMeta = sanitizeObject(metadata);
    if (sanitizedMeta.stepIndex !== undefined) payload.stepIndex = sanitizedMeta.stepIndex;
    if (sanitizedMeta.stepType !== undefined) payload.stepType = sanitizedMeta.stepType;
    if (sanitizedMeta.status !== undefined) payload.status = sanitizedMeta.status;
    if (sanitizedMeta.screenshotPath !== undefined) payload.screenshotPath = sanitizedMeta.screenshotPath;
    
    for (const key of Object.keys(sanitizedMeta)) {
      if (payload[key] === undefined && sanitizedMeta[key] !== undefined && typeof sanitizedMeta[key] !== "object") {
        payload[key] = sanitizedMeta[key];
      }
    }
    
    payload.metadata = cleanUndefined(sanitizedMeta);
  }

  await logRef.set(payload);

  console.log(`[${level}] [Job: ${jobId}] ${message}`);
}
