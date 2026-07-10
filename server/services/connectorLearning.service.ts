import { getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

class ConnectorLearningService {
  private getDbSafe() {
    if (getApps().length === 0) throw new Error("Firebase not initialized");
    return getFirestore(getApps()[0], "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee");
  }

  async createPatchProposal(proposalData: any) {
    const db = this.getDbSafe();
    
    // We run a transaction to mark previous pending_review proposals as superseded
    // and write the new proposal.
    const proposal = await db.runTransaction(async (transaction) => {
      // Find all existing proposals for this ticketId that are pending_review
      const query = db.collection("connector_patch_proposals")
        .where("ticketId", "==", proposalData.ticketId)
        .where("status", "==", "pending_review");
      
      const proposalsSnap = await transaction.get(query);
      
      proposalsSnap.docs.forEach((doc) => {
        transaction.update(doc.ref, {
          status: "superseded",
          updatedAt: new Date().toISOString(),
          supersededAt: new Date().toISOString()
        });
      });
      
      const docRef = db.collection("connector_patch_proposals").doc();
      const newProposal = {
        proposalId: docRef.id,
        status: "pending_review",
        createdBy: "gemini",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        reviewedBy: null,
        reviewedAt: null,
        appliedAt: null,
        ...proposalData
      };
      
      transaction.set(docRef, newProposal);
      return newProposal;
    });
    
    return proposal;
  }

  async listPatchProposals(filters: any = {}) {
    const db = this.getDbSafe();
    let query: any = db.collection("connector_patch_proposals");
    if (filters.connectorId) {
      query = query.where("connectorId", "==", filters.connectorId);
    }
    if (filters.status) {
      query = query.where("status", "==", filters.status);
    }
    const snap = await query.get();
    return snap.docs.map((d: any) => d.data());
  }

  async transitionProposalStatus(
    proposalId: string,
    targetStatus: string,
    adminUser: any,
    extraFields: any = {}
  ) {
    const db = this.getDbSafe();
    const docRef = db.collection("connector_patch_proposals").doc(proposalId);
    
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists) {
        throw new Error("PROPOSAL_NOT_FOUND");
      }
      
      const proposal = snap.data();
      const currentStatus = proposal.status;
      
      // Idempotency: if already in the target status, do nothing
      if (currentStatus === targetStatus) {
        return;
      }
      
      // Enforce strict state transitions
      if (targetStatus === "approved_for_sandbox" || targetStatus === "rejected" || targetStatus === "revision_requested" || targetStatus === "superseded") {
        if (currentStatus !== "pending_review") {
          throw new Error(`INVALID_TRANSITION: Cannot transition from ${currentStatus} to ${targetStatus}`);
        }
      } else if (targetStatus === "approved_for_observation") {
        if (currentStatus !== "approved_for_sandbox") {
          throw new Error(`INVALID_TRANSITION: Cannot transition from ${currentStatus} to ${targetStatus}`);
        }
      } else if (targetStatus === "active") {
        if (currentStatus !== "approved_for_sandbox" && currentStatus !== "approved_for_observation") {
          throw new Error(`INVALID_TRANSITION: Cannot transition from ${currentStatus} to ${targetStatus}`);
        }
      } else {
        throw new Error(`UNKNOWN_TARGET_STATUS: ${targetStatus}`);
      }
      
      // Update proposal
      const adminEmail = adminUser?.email || adminUser?.uid || adminUser?.userId || "admin@zenticket.com";
      const timestamp = new Date().toISOString();
      
      transaction.update(docRef, {
        status: targetStatus,
        reviewedBy: adminEmail,
        reviewedAt: timestamp,
        updatedAt: timestamp,
        ...extraFields
      });
      
      // Write audit log inside the same transaction
      const auditRef = db.collection("ai_audit_logs").doc();
      transaction.set(auditRef, {
        requestId: auditRef.id,
        adminUserId: adminUser?.uid || adminUser?.userId || "admin",
        ticketId: proposal.ticketId || "",
        connectorId: proposal.connectorId || "",
        status: `status_change_from_${currentStatus}_to_${targetStatus}`,
        createdAt: timestamp,
        proposalId,
        reviewedBy: adminEmail,
        comment: extraFields.comment || null
      });
    });
  }

  async approveForSandbox(proposalId: string, adminUser: any) {
    await this.transitionProposalStatus(proposalId, "approved_for_sandbox", adminUser);
  }

  async rejectProposal(proposalId: string, adminUser: any) {
    await this.transitionProposalStatus(proposalId, "rejected", adminUser);
  }

  async requestRevision(proposalId: string, comment: string, adminUser: any) {
    await this.transitionProposalStatus(proposalId, "revision_requested", adminUser, { comment });
  }

  async promoteToObservation(proposalId: string, adminUser: any) {
    await this.transitionProposalStatus(proposalId, "approved_for_observation", adminUser);
  }

  async promoteToActive(proposalId: string, adminUser: any) {
    await this.transitionProposalStatus(proposalId, "active", adminUser, { appliedAt: new Date().toISOString() });
  }
}

export const connectorLearningService = new ConnectorLearningService();
