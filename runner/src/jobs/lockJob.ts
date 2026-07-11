import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getApp } from "firebase-admin/app";
import { randomUUID } from "crypto";
import { createRunnerLog } from "../logging/createRunnerLog";

const LEASE_DURATION_MS = 5 * 60 * 1000;

function asMillis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof (value as any)?.toMillis === "function") return (value as any).toMillis();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function hasActiveLease(job: any, nowMs: number): boolean {
  const expiresAt = asMillis(job?.leaseExpiresAt) ?? asMillis(job?.lease?.expiresAt);
  if (expiresAt !== null) return expiresAt > nowMs;
  const lockedAt = asMillis(job?.lockedAt);
  return !!job?.lockedBy && lockedAt !== null && lockedAt + LEASE_DURATION_MS > nowMs;
}

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

      const now = Timestamp.now();
      if (hasActiveLease(data, now.toMillis())) return null;

      const attemptId = randomUUID();
      const leaseExpiresAt = Timestamp.fromMillis(now.toMillis() + LEASE_DURATION_MS);
      const attemptRef = jobRef.collection("attempts").doc(attemptId);

      const updateData = {
        status: "locked",
        lockedBy: workerId,
        lockedAt: now,
        activeAttemptId: attemptId,
        lease: {
          workerId,
          attemptId,
          acquiredAt: now,
          heartbeatAt: now,
          expiresAt: leaseExpiresAt
        },
        leaseExpiresAt,
        updatedAt: now
      };

      transaction.update(jobRef, updateData);
      transaction.set(attemptRef, {
        attemptId,
        jobId,
        ticketId: data.ticketId || null,
        connectorId: data.connectorId || null,
        workerId,
        status: "running",
        startedAt: now,
        heartbeatAt: now,
        leaseExpiresAt,
        timeline: [{ stage: "job_lock", status: "success", createdAt: now.toDate().toISOString() }]
      });
      return { id: docSnap.id, ...data, ...updateData, attemptId, originalStatus: data.status };
    }) as any;

    if (lockedJob) {
      await createRunnerLog(jobId, lockedJob.ticketId, "INFO", `Job bloqueado exitosamente por el worker: ${workerId}`, { attemptId: lockedJob.attemptId });
    }
    return lockedJob;
  } catch (err: any) {
    console.error(`Error locking job ${jobId}:`, err.message);
    return null;
  }
}

export async function heartbeatAttempt(jobId: string, attemptId: string, workerId: string): Promise<boolean> {
  const db = getFirestore(getApp(), "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee");
  const jobRef = db.collection("invoice_jobs").doc(jobId);
  const now = Timestamp.now();
  const leaseExpiresAt = Timestamp.fromMillis(now.toMillis() + LEASE_DURATION_MS);

  return db.runTransaction(async (transaction) => {
    const jobSnap = await transaction.get(jobRef);
    const job = jobSnap.data();
    if (!jobSnap.exists || job?.activeAttemptId !== attemptId || job?.lockedBy !== workerId) return false;
    transaction.update(jobRef, {
      "lease.heartbeatAt": now,
      "lease.expiresAt": leaseExpiresAt,
      leaseExpiresAt,
      updatedAt: now
    });
    transaction.update(jobRef.collection("attempts").doc(attemptId), {
      heartbeatAt: now,
      leaseExpiresAt
    });
    return true;
  });
}

export async function closeAttempt(jobId: string, attemptId: string, finalStage: string): Promise<void> {
  const db = getFirestore(getApp(), "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee");
  const jobRef = db.collection("invoice_jobs").doc(jobId);
  const jobSnap = await jobRef.get();
  const now = Timestamp.now();
  await jobRef.collection("attempts").doc(attemptId).set({
    status: "finished",
    finalStage,
    finalJobStatus: jobSnap.data()?.status || "unknown",
    finishedAt: now,
    heartbeatAt: now
  }, { merge: true });
}
