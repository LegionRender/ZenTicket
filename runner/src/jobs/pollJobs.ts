import { getFirestore } from "firebase-admin/firestore";

export async function pollJobs(): Promise<string[]> {
  const db = getFirestore();
  try {
    const snapshot = await db.collection("invoice_jobs")
      .where("status", "==", "pending")
      .orderBy("createdAt", "asc")
      .limit(10)
      .get();

    if (snapshot.empty) {
      return [];
    }

    return snapshot.docs.map(doc => doc.id);
  } catch (err: any) {
    console.error("Error polling pending jobs:", err.message);
    return [];
  }
}
