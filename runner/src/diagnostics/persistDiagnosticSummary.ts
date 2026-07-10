import { DiagnosticSummary } from "../../../shared/diagnostics/diagnostic-types";

const getDb = () => {
  try {
    const { getApp } = require("firebase-admin/app");
    const { getFirestore } = require("firebase-admin/firestore");
    const databaseId = "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee";
    return getFirestore(getApp(), databaseId);
  } catch (err) {
    const { getFirestore } = require("firebase-admin/firestore");
    return getFirestore();
  }
};

export const persistDiagnosticSummary = async (ticketId: string, summary: DiagnosticSummary): Promise<void> => {
  const db = getDb();
  await db.collection("diagnostic_summaries").doc(ticketId).set({
    ...summary,
    updatedAt: new Date().toISOString()
  }, { merge: true });
};
