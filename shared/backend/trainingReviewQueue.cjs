const crypto = require("crypto");
const { enqueueInvoiceJob, InvoiceEnqueueError } = require("./invoiceQueue.cjs");

function queueKeyForProposal(proposalId) {
  return `training-${crypto.createHash("sha256").update(String(proposalId)).digest("hex").slice(0, 48)}`;
}

/**
 * A human administrator may promote a reviewed training proposal to observation.
 * Only this explicit transition materializes its draft connector/map and resumes
 * the original ticket through the canonical, idempotent invoice queue.
 */
async function promoteTrainingProposalToObservation({ db, proposalId, adminUser }) {
  if (!db || typeof db.runTransaction !== "function") throw new Error("DATABASE_UNAVAILABLE");
  if (!proposalId) throw new Error("PROPOSAL_NOT_FOUND");

  const proposalRef = db.collection("connector_patch_proposals").doc(proposalId);
  const promotion = await db.runTransaction(async (transaction) => {
    const proposalSnap = await transaction.get(proposalRef);
    if (!proposalSnap.exists) throw new Error("PROPOSAL_NOT_FOUND");

    const proposal = proposalSnap.data() || {};
    if (proposal.status !== "approved_for_sandbox" && proposal.status !== "approved_for_observation") {
      throw new Error(`INVALID_TRANSITION: Cannot transition from ${proposal.status || "unknown"} to approved_for_observation`);
    }

    const ticketId = String(proposal.ticketId || "");
    const connectorId = String(proposal.connectorId || proposal.candidateConnector?.id || "");
    const portalMapId = String(proposal.portalMapId || proposal.candidatePortalMap?.id || (connectorId ? `map-${connectorId}` : ""));
    if (!ticketId || !connectorId || !portalMapId) throw new Error("TRAINING_PROPOSAL_INCOMPLETE");

    const ticketRef = db.collection("tickets").doc(ticketId);
    const connectorRef = db.collection("connectors").doc(connectorId);
    const portalMapRef = db.collection("portal_maps").doc(portalMapId);
    const [ticketSnap, connectorSnap, portalMapSnap] = await Promise.all([
      transaction.get(ticketRef),
      transaction.get(connectorRef),
      transaction.get(portalMapRef)
    ]);
    if (!ticketSnap.exists) throw new Error("TICKET_NOT_FOUND");

    const ticket = ticketSnap.data() || {};
    const candidateConnector = proposal.candidateConnector || null;
    const candidatePortalMap = proposal.candidatePortalMap || null;
    if (!connectorSnap.exists && !candidateConnector) throw new Error("CONNECTOR_DRAFT_NOT_FOUND");
    if (!portalMapSnap.exists && !candidatePortalMap) throw new Error("PORTAL_MAP_DRAFT_NOT_FOUND");

    const now = new Date().toISOString();
    const reviewedBy = adminUser?.email || adminUser?.uid || "admin";
    const existingConnector = connectorSnap.exists ? connectorSnap.data() : null;
    const existingPortalMap = portalMapSnap.exists ? portalMapSnap.data() : null;
    const connector = {
      ...(existingConnector || candidateConnector),
      id: connectorId,
      // A review may activate a draft, but never downgrades a live connector.
      status: existingConnector?.status === "production_ready" || existingConnector?.status === "real_validation"
        ? existingConnector.status
        : "approved_for_observation",
      runnerAvailable: true,
      observationApprovedAt: now,
      observationApprovedBy: reviewedBy,
      updatedAt: now
    };
    const portalMap = {
      ...(existingPortalMap || candidatePortalMap),
      connectorId,
      status: existingPortalMap?.status === "production_ready" || existingPortalMap?.status === "approved"
        ? existingPortalMap.status
        : "approved_for_observation",
      isApproved: true,
      observationApprovedAt: now,
      observationApprovedBy: reviewedBy,
      updatedAt: now
    };

    transaction.set(connectorRef, connector, { merge: false });
    transaction.set(portalMapRef, portalMap, { merge: false });
    transaction.update(ticketRef, {
      connectorId,
      portalMapId,
      status: "training_approved_queueing",
      reviewReasonCode: null,
      errorMsg: null,
      updatedAt: now
    });
    transaction.update(proposalRef, {
      status: "approved_for_observation",
      reviewedBy,
      reviewedAt: now,
      updatedAt: now,
      materializedAt: now
    });
    const auditRef = db.collection("ai_audit_logs").doc();
    transaction.set(auditRef, {
      requestId: auditRef.id,
      adminUserId: adminUser?.uid || "admin",
      ticketId,
      connectorId,
      proposalId,
      status: "training_promoted_to_observation",
      createdAt: now,
      reviewedBy
    });
    return { ticketId, userId: ticket.userId, connectorId, portalMapId };
  });

  try {
    const queue = await enqueueInvoiceJob({
      db,
      userId: promotion.userId,
      ticketId: promotion.ticketId,
      idempotencyKey: queueKeyForProposal(proposalId)
    });
    return { ...promotion, queue, enqueued: true };
  } catch (error) {
    const now = new Date().toISOString();
    await db.collection("tickets").doc(promotion.ticketId).set({
      status: "training_approved_queue_blocked",
      reviewReasonCode: error instanceof InvoiceEnqueueError ? error.code : "TRAINING_QUEUE_FAILED",
      errorMsg: "El conector fue aprobado; falta resolver una validación antes de enviar la solicitud.",
      updatedAt: now
    }, { merge: true });
    if (error instanceof InvoiceEnqueueError) {
      return { ...promotion, enqueued: false, queueError: { code: error.code, details: error.details } };
    }
    throw error;
  }
}

module.exports = { promoteTrainingProposalToObservation };
