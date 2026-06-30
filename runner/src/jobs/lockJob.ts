import { getFirestore } from "firebase-admin/firestore";
import { createRunnerLog } from "../logging/createRunnerLog";

/**
 * Atomically locks a job in Firestore using a transaction to avoid multiple workers picking it up.
 */
export async function lockJob(jobId: string, workerId: string): Promise<any | null> {
  const db = getFirestore();
  const jobRef = db.collection("invoice_jobs").doc(jobId);

  try {
    const lockedJob = await db.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(jobRef);
      if (!docSnap.exists) {
        return null;
      }

      const data = docSnap.data();
      if (!data) return null;

      // Only lock if status is pending, validating_sat, or failed (retry) and not locked
      if (data.status !== "pending" && data.status !== "failed" && data.status !== "validating_sat") {
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
      return { id: docSnap.id, ...data, ...updateData };
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
