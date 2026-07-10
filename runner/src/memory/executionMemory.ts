import { Firestore, FieldValue } from "firebase-admin/firestore";

function safeDomain(url: string): string {
  try { return new URL(url).hostname.toLowerCase(); } catch { return "unknown"; }
}

export async function saveExecutionMemory(
  db: Firestore,
  connector: any,
  portalMap: any,
  result: any
): Promise<void> {
  const domain = safeDomain(connector?.portalUrl || portalMap?.entryUrl || "");
  if (domain === "unknown") return;
  const patterns = [
    { type: "download_method", pattern: { method: result?.documentSource || "download" } },
    { type: "step_count", pattern: { count: Array.isArray(portalMap?.normalizedSteps) ? portalMap.normalizedSteps.length : (Array.isArray(portalMap?.steps) ? portalMap.steps.length : null) } },
    { type: "framework_detected", pattern: { framework: portalMap?.portalMetadata?.framework || "unknown" } }
  ];
  for (const item of patterns) {
    const id = `${domain}-${item.type}`.replace(/[^a-z0-9_-]/g, "-");
    await db.collection("portal_learning_memory").doc(id).set({
      domain,
      patternType: item.type,
      pattern: item.pattern,
      connectorId: connector?.id || portalMap?.connectorId || null,
      successCount: FieldValue.increment(1),
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    }, { merge: true });
  }
}

export async function queryLearningMemory(db: Firestore, domain: string): Promise<any[]> {
  const snapshot = await db.collection("portal_learning_memory").where("domain", "==", domain).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
