import { getFirestore } from "firebase-admin/firestore";
import { getApp } from "firebase-admin/app";

export async function pollJobs(): Promise<string[]> {
  const db = getFirestore(getApp(), "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee");
  try {
    // Poll both pending jobs and jobs waiting for SAT verification
    const snapshot = await db.collection("invoice_jobs")
      .where("status", "in", ["pending", "validating_sat"])
      .limit(10)
      .get();

    if (snapshot.empty) {
      return [];
    }

    return snapshot.docs.map(doc => doc.id);
  } catch (err: any) {
    console.error("Error polling pending/validating_sat jobs:", err.message);
    return [];
  }
}
