import { getFirestore } from "firebase-admin/firestore";
import { getApp } from "firebase-admin/app";
import { createRunnerLog } from "../logging/createRunnerLog";

/**
 * Atomically locks a job in Firestore using a transaction to avoid multiple workers picking it up.
 */
export async function lockJob(jobId: string, workerId: string): Promise<any | null> {
  const db = getFirestore(getApp(), "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee");
  const jobRef = db.collection("invoice_jobs").doc(jobId);

  try {
    const lockedJob = await db.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(jobRef);
      if (!docSnap.exists) {
        return null;
      }

      const data = docSnap.data();
      if (!data) return null;

      // Only lock if status is pending, pending_local, validating_sat, or failed (retry) and not locked
      if (
        data.status !== "pending" &&
        data.status !== "pending_local" &&
        data.status !== "failed" &&
        data.status !== "validating_sat" &&
        data.status !== "invoice_recovery_pending" &&
        data.status !== "invoice_recovery_retrying"
      ) {
        return null;
      }

      if (data.lockedBy) {
        return null; // Already locked
      }

      const updateData = {
        status: "locked",
        lockedBy: workerId,
        lockedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      transaction.update(jobRef, updateData);
      return { id: docSnap.id, ...data, ...updateData, originalStatus: data.status };
    }) as any;

    if (lockedJob) {
      await createRunnerLog(jobId, lockedJob.ticketId, "INFO", `Job bloqueado exitosamente por el worker: ${workerId}`);
    }
    return lockedJob;
  } catch (err: any) {
    console.error(`Error locking job ${jobId}:`, err.message);
    return null;
  }
}
