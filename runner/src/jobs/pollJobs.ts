import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getApp } from "firebase-admin/app";

export async function pollJobs(): Promise<string[]> {
  const db = getFirestore(getApp(), "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee");
  try {
    const isLocalDev = process.env.NODE_ENV !== "production" && !process.env.K_SERVICE;
    const isE2EMode = process.env.LOCAL_E2E_MODE === "true" || isLocalDev;
    const allowedJobsEnv = process.env.LOCAL_E2E_ALLOWED_JOB_IDS;
    const allowedTicketsEnv = process.env.LOCAL_E2E_ALLOWED_TICKET_IDS;

    if (isE2EMode) {
      if (!allowedJobsEnv || !allowedTicketsEnv) {
        console.warn("\n[CRITICAL WARNING] EL RUNNER LOCAL ESTÁ EN MODO E2E REAL PERO FALTA LA CONFIGURACIÓN DE WHITELIST.");
        console.warn("Se ha suspendido el polling local para evitar interferencias con jobs de producción.");
        console.warn("Por favor define LOCAL_E2E_ALLOWED_JOB_IDS y LOCAL_E2E_ALLOWED_TICKET_IDS en tu archivo .env.\n");
        return [];
      }
    }

    const allowedJobs = allowedJobsEnv ? allowedJobsEnv.split(",").map(s => s.trim()).filter(Boolean) : [];
    const allowedTickets = allowedTicketsEnv ? allowedTicketsEnv.split(",").map(s => s.trim()).filter(Boolean) : [];

    // Poll both pending jobs and jobs waiting for SAT verification
    const snapshot = await db.collection("invoice_jobs")
      .where("status", "in", ["pending_local", "validating_sat", "invoice_recovery_pending", "invoice_recovery_retrying"])
      .limit(10)
      .get();

    if (snapshot.empty) {
      return [];
    }

    const now = Timestamp.now();
    const eligibleDocs = snapshot.docs.filter(doc => {
      const data = doc.data();

      // Enforce whitelist check if running in E2E mode / local dev
      if (isE2EMode) {
        const matchJob = allowedJobs.includes(doc.id);
        const matchTicket = allowedTickets.includes(data.ticketId);
        if (!matchJob && !matchTicket) {
          return false;
        }
      }

      if (data.status === "validating_sat") {
        if (data.nextSatValidationAt) {
          // nextSatValidationAt is stored as a Firestore Timestamp
          return now.toMillis() >= data.nextSatValidationAt.toMillis();
        }
      }

      if (data.status === "invoice_recovery_pending" || data.status === "invoice_recovery_retrying") {
        if (data.nextRecoveryAt) {
          const nextTime = typeof data.nextRecoveryAt === "string"
            ? new Date(data.nextRecoveryAt).getTime()
            : data.nextRecoveryAt.toMillis();
          return now.toMillis() >= nextTime;
        }
      }
      return true;
    });

    return eligibleDocs.map(doc => doc.id);
  } catch (err: any) {
    console.error("Error polling pending/validating_sat jobs:", err.message);
    return [];
  }
}
