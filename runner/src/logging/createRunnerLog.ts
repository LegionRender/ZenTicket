import { getFirestore } from "firebase-admin/firestore";

let activeJobId: string | null = null;
let activeTicketId: string | null = null;
let activeConnectorId: string | null = null;
let activeEnvironment: string | null = null;

export function setActiveJobContext(
  jobId: string | null,
  ticketId: string | null,
  connectorId: string | null,
  environment: string | null
) {
  activeJobId = jobId;
  activeTicketId = ticketId;
  activeConnectorId = connectorId;
  activeEnvironment = environment;
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
    message,
    metadata: metadata ? cleanUndefined(metadata) : null,
    timestamp,
    createdAt: timestamp
  };

  // Inject context details if this is the active running job
  if (activeJobId === jobId) {
    payload.connectorId = activeConnectorId;
    if (activeEnvironment) {
      payload.environment = activeEnvironment;
    }
  }

  // Map step/result details if provided in metadata
  if (metadata) {
    const cleanedMeta = cleanUndefined(metadata);
    if (cleanedMeta.stepIndex !== undefined) payload.stepIndex = cleanedMeta.stepIndex;
    if (cleanedMeta.stepType !== undefined) payload.stepType = cleanedMeta.stepType;
    if (cleanedMeta.status !== undefined) payload.status = cleanedMeta.status;
    if (cleanedMeta.screenshotPath !== undefined) payload.screenshotPath = cleanedMeta.screenshotPath;
  }

  await logRef.set(payload);

  console.log(`[${level}] [Job: ${jobId}] ${message}`);
}
