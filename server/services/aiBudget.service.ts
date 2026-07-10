import { getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

class AiBudgetService {
  private getDbSafe() {
    if (getApps().length === 0) throw new Error("Firebase not initialized");
    return getFirestore(getApps()[0], "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee");
  }

  // 1. Cache only check (no counters modified)
  async checkCacheOnly(sanitizedInputHash: string) {
    const db = this.getDbSafe();
    const cacheSnap = await db.collection("connector_patch_proposals")
      .where("sanitizedInputHash", "==", sanitizedInputHash)
      .where("status", "==", "pending_review")
      .limit(1)
      .get();
      
    if (!cacheSnap.empty) {
      console.log(`[AiBudget] Cache hit for sanitizedInputHash: ${sanitizedInputHash}`);
      return cacheSnap.docs[0].data();
    }
    return null;
  }

  // 2. Transactional quota reservation (increments counters)
  async reserveQuota(ticketId: string) {
    const db = this.getDbSafe();
    const dailyLimit = parseInt(process.env.GEMINI_DAILY_BUDGET_LIMIT || "100", 10);
    const monthlyLimit = parseInt(process.env.GEMINI_MONTHLY_BUDGET_LIMIT || "1000", 10);
    
    const now = new Date();
    const dailyKey = "daily_" + now.toISOString().split("T")[0]; // YYYY-MM-DD
    const monthlyKey = "monthly_" + now.toISOString().substring(0, 7); // YYYY-MM
    const ticketKey = "ticket_" + ticketId;

    const dailyDocRef = db.collection("ai_budget_counters").doc(dailyKey);
    const monthlyDocRef = db.collection("ai_budget_counters").doc(monthlyKey);
    const ticketDocRef = db.collection("ai_budget_counters").doc(ticketKey);

    await db.runTransaction(async (transaction) => {
      const dailySnap = await transaction.get(dailyDocRef);
      const monthlySnap = await transaction.get(monthlyDocRef);
      const ticketSnap = await transaction.get(ticketDocRef);

      const dailyCount = dailySnap.exists ? (dailySnap.data()?.count || 0) : 0;
      const monthlyCount = monthlySnap.exists ? (monthlySnap.data()?.count || 0) : 0;
      const ticketCount = ticketSnap.exists ? (ticketSnap.data()?.count || 0) : 0;

      if (dailyCount >= dailyLimit) {
        throw new Error("DAILY_BUDGET_EXCEEDED");
      }
      if (monthlyCount >= monthlyLimit) {
        throw new Error("MONTHLY_BUDGET_EXCEEDED");
      }
      if (ticketCount >= 10) {
        throw new Error("TICKET_BUDGET_EXCEEDED");
      }

      // Increment counters
      transaction.set(dailyDocRef, { count: dailyCount + 1 }, { merge: true });
      transaction.set(monthlyDocRef, { count: monthlyCount + 1 }, { merge: true });
      transaction.set(ticketDocRef, { count: ticketCount + 1 }, { merge: true });
    });

    return { dailyKey, monthlyKey, ticketKey };
  }

  // 3. Transactional quota release (decrements counters in case of failure)
  async releaseQuota(keys: { dailyKey: string; monthlyKey: string; ticketKey: string }) {
    const db = this.getDbSafe();
    const dailyDocRef = db.collection("ai_budget_counters").doc(keys.dailyKey);
    const monthlyDocRef = db.collection("ai_budget_counters").doc(keys.monthlyKey);
    const ticketDocRef = db.collection("ai_budget_counters").doc(keys.ticketKey);

    await db.runTransaction(async (transaction) => {
      const dailySnap = await transaction.get(dailyDocRef);
      const monthlySnap = await transaction.get(monthlyDocRef);
      const ticketSnap = await transaction.get(ticketDocRef);

      const dailyCount = dailySnap.exists ? (dailySnap.data()?.count || 0) : 0;
      const monthlyCount = monthlySnap.exists ? (monthlySnap.data()?.count || 0) : 0;
      const ticketCount = ticketSnap.exists ? (ticketSnap.data()?.count || 0) : 0;

      transaction.set(dailyDocRef, { count: Math.max(0, dailyCount - 1) }, { merge: true });
      transaction.set(monthlyDocRef, { count: Math.max(0, monthlyCount - 1) }, { merge: true });
      transaction.set(ticketDocRef, { count: Math.max(0, ticketCount - 1) }, { merge: true });
    });
  }

  async logUsage(logData: {
    adminUserId: string;
    ticketId: string;
    connectorId: string;
    model: string;
    status: string;
    error?: string;
  }) {
    const db = this.getDbSafe();
    const docRef = db.collection("ai_usage_logs").doc();
    await docRef.set({
      requestId: docRef.id,
      createdAt: new Date().toISOString(),
      ...logData
    });
  }
}

export const aiBudgetService = new AiBudgetService();
