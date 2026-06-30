import { getFirestore } from "firebase-admin/firestore";

export async function pollJobs(): Promise<string[]> {
  const db = getFirestore();
  try {
    // Poll both pending jobs and jobs waiting for SAT verification
    const snapshot = await db.collection("invoice_jobs")
      .where("status", "in", ["pending", "validating_sat"])
      .orderBy("createdAt", "asc")
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
