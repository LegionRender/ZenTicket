import { getFirestore } from "firebase-admin/firestore";

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

  await logRef.set({
    jobId,
    ticketId,
    level,
    message,
    metadata: metadata || null,
    timestamp
  });

  console.log(`[${level}] [Job: ${jobId}] ${message}`);
}
