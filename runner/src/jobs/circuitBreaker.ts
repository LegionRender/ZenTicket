import { createHash } from "crypto";
import { getApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const FAILURE_THRESHOLD = 3;

export interface CircuitBreakerResult {
  signature: string;
  failureCount: number;
  opened: boolean;
}

export async function recordConnectorFailure(
  connectorId: string,
  errorCode: string,
  stage: string
): Promise<CircuitBreakerResult> {
  const db = getFirestore(getApp(), "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee");
  const signature = createHash("sha256").update(`${connectorId}:${errorCode}:${stage}`).digest("hex").slice(0, 32);
  const breakerRef = db.collection("connector_circuit_breakers").doc(`${connectorId}-${signature}`);
  const connectorRef = db.collection("connectors").doc(connectorId);

  return db.runTransaction(async (transaction) => {
    const now = Timestamp.now();
    const existingSnap = await transaction.get(breakerRef);
    const existing = existingSnap.data() || {};
    const windowStartedAt = existing.windowStartedAt?.toMillis?.() ?? 0;
    const inWindow = now.toMillis() - windowStartedAt <= FAILURE_WINDOW_MS;
    const failureCount = (inWindow ? Number(existing.failureCount || 0) : 0) + 1;
    const opened = failureCount >= FAILURE_THRESHOLD;

    transaction.set(breakerRef, {
      connectorId, signature, errorCode, stage, failureCount,
      threshold: FAILURE_THRESHOLD,
      windowStartedAt: inWindow ? existing.windowStartedAt : now,
      lastFailureAt: now,
      state: opened ? "open" : "closed",
      openedAt: opened ? now : null,
      updatedAt: now
    }, { merge: true });

    if (opened) {
      transaction.set(connectorRef, {
        runnerAvailable: false,
        status: "observation_blocked",
        circuitBreaker: { signature, errorCode, stage, openedAt: now, failureCount },
        updatedAt: now
      }, { merge: true });
    }
    return { signature, failureCount, opened };
  });
}
