import { getFirestore } from "firebase-admin/firestore";

let activeJobId: string | null = null;
let activeTicketId: string | null = null;
let activeConnectorId: string | null = null;
let activeJobPilotMode = false;
let activeEnvironment: string | null = null;

export function setActiveJobContext(
  jobId: string | null,
  ticketId: string | null,
  connectorId: string | null,
  pilotMode: boolean,
  environment: string | null
) {
  activeJobId = jobId;
  activeTicketId = ticketId;
  activeConnectorId = connectorId;
  activeJobPilotMode = pilotMode;
  activeEnvironment = environment;
}

export async function createRunnerLog(
  jobId: string,
  ticketId: string,
  level: "INFO" | "WARNING" | "ERROR",
  message: string,
  metadata?: any
) {
  const db = getFirestore();
  const logRef = db.collection("runner_logs").doc();
  const timestamp = new Date().toISOString();

  const payload: any = {
    jobId,
    ticketId,
    level,
    message,
    metadata: metadata || null,
    timestamp,
    createdAt: timestamp
  };

  // Inject pilot context details if this is the active running job
  if (activeJobId === jobId) {
    payload.pilotMode = activeJobPilotMode;
    payload.connectorId = activeConnectorId;
    if (activeEnvironment) {
      payload.environment = activeEnvironment;
    }
  }

  // Map step/result details if provided in metadata
  if (metadata) {
    if (metadata.stepIndex !== undefined) payload.stepIndex = metadata.stepIndex;
    if (metadata.stepType !== undefined) payload.stepType = metadata.stepType;
    if (metadata.status !== undefined) payload.status = metadata.status;
    if (metadata.screenshotPath !== undefined) payload.screenshotPath = metadata.screenshotPath;
  }

  await logRef.set(payload);

  console.log(`[${level}] [Job: ${jobId}] ${message}`);
}
