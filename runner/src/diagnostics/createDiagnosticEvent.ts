import { DiagnosticEvent } from "../../../shared/diagnostics/diagnostic-types";
import { sanitizeRunnerDiagnostic } from "../../../shared/diagnostics/diagnostic-sanitizer";

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

export const createDiagnosticEvent = async (event: DiagnosticEvent): Promise<string> => {
  const db = getDb();
  const sanitized = sanitizeRunnerDiagnostic(event);
  
  const docRef = await db.collection("runner_diagnostics").add({
    ...sanitized,
    createdAt: new Date().toISOString()
  });

  return docRef.id;
};
