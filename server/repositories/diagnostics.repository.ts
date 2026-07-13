import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export class DiagnosticsRepository {
  private getDbSafe() {
    const hasCreds = !!(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS);
    const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
    
    if (getApps().length === 0) {
      if (!hasCreds && !hasEmulator) {
        throw new Error("Admin Diagnostics backend no tiene conexión válida a Firestore. Configura credenciales o emulador.");
      }
      try {
        initializeApp({ projectId: "factubolt" });
      } catch (e) {
        // ignore
      }
    }
    
    if (getApps().length === 0) {
      throw new Error("Admin Diagnostics backend no tiene conexión válida a Firestore. Configura credenciales o emulador.");
    }
    
    return getFirestore(getApps()[0], "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee");
  }

  async listSummaries(filters: any) {
    const db = this.getDbSafe();
    let queryRef: any = db.collection("diagnostic_summaries");

    if (filters.userId) queryRef = queryRef.where("userId", "==", filters.userId);
    if (filters.connectorId) queryRef = queryRef.where("connectorId", "==", filters.connectorId);
    if (filters.portalName) queryRef = queryRef.where("affectedPortal", "==", filters.portalName);
    if (filters.ticketId) queryRef = queryRef.where("ticketId", "==", filters.ticketId);
    if (filters.ticketReference) queryRef = queryRef.where("ticketReference", "==", filters.ticketReference);
    if (filters.jobId) queryRef = queryRef.where("jobId", "==", filters.jobId);
    if (filters.stage) queryRef = queryRef.where("currentStage", "==", filters.stage);
    if (filters.errorCode) queryRef = queryRef.where("latestEvent.errorCode", "==", filters.errorCode);
    if (filters.severity) queryRef = queryRef.where("severity", "==", filters.severity);
    if (filters.status) queryRef = queryRef.where("latestEvent.status", "==", filters.status);
    if (filters.requiresManualReview !== undefined) {
      queryRef = queryRef.where("latestEvent.requiresManualReview", "==", filters.requiresManualReview);
    }
    if (filters.retryable !== undefined) {
      queryRef = queryRef.where("latestEvent.retryable", "==", filters.retryable);
    }
    if (filters.problemSignature) {
      queryRef = queryRef.where("problemSignature", "==", filters.problemSignature);
    }

    queryRef = queryRef.orderBy("failedAt", "desc");

    if (filters.cursor) {
      const cursorDoc = await db.collection("diagnostic_summaries").doc(filters.cursor).get();
      if (cursorDoc.exists) {
        queryRef = queryRef.startAfter(cursorDoc);
      }
    }

    const limit = filters.limit || 20;
    queryRef = queryRef.limit(limit);

    const snapshot = await queryRef.get();
    const items = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    const nextCursor = items.length === limit ? items[items.length - 1].id : null;

    return {
      items,
      nextCursor
    };
  }

  async getSummary(ticketId: string): Promise<any> {
    const db = this.getDbSafe();
    const docSnap = await db.collection("diagnostic_summaries").doc(ticketId).get();
    if (!docSnap.exists) return null;
    return { id: docSnap.id, ...docSnap.data() };
  }

  async getTimeline(ticketId: string) {
    const db = this.getDbSafe();
    const snapshot = await db.collection("runner_diagnostics")
      .where("ticketId", "==", ticketId)
      .orderBy("createdAt", "asc")
      .get();
      
    return snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));
  }

  async getTicket(ticketId: string): Promise<any> {
    const db = this.getDbSafe();
    const docSnap = await db.collection("tickets").doc(ticketId).get();
    if (!docSnap.exists) return null;
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      ...data
    };
  }

  async listProblematicTickets(filters: any): Promise<any[]> {
    const db = this.getDbSafe();
    if (filters.ticketId) {
      const docSnap = await db.collection("tickets").doc(filters.ticketId).get();
      if (!docSnap.exists) return [];
      return [{ id: docSnap.id, ...docSnap.data() }];
    }

    if (filters.ticketReference) {
      const snapFolio = await db.collection("tickets").where("folio", "==", filters.ticketReference).get();
      const snapBilling = await db.collection("tickets").where("portalFields.billingReference", "==", filters.ticketReference).get();
      
      const allDocsMap = new Map<string, any>();
      snapFolio.docs.forEach((doc: any) => {
        allDocsMap.set(doc.id, { id: doc.id, ...doc.data() });
      });
      snapBilling.docs.forEach((doc: any) => {
        allDocsMap.set(doc.id, { id: doc.id, ...doc.data() });
      });
      
      return Array.from(allDocsMap.values());
    }

    const statuses = [
      "requires_manual_review",
      "already_invoiced_unverified",
      "invoice_recovery_pending",
      "invoice_recovery_retrying",
      "requires_field_correction",
      "cfdi_validation_failed",
      "sat_validation_failed",
      "automation_failed",
      "failed",
      "failed_local",
      "blocked",
      "captcha_required",
      "waiting_user_captcha",
      "extracted",
      "scanned",
      "analyzed",
      "portal_fields_ready",
      "pending_local",
      "processing"
    ];

    const chunks = [];
    for (let i = 0; i < statuses.length; i += 10) {
      chunks.push(statuses.slice(i, i + 10));
    }

    const allDocsMap = new Map<string, any>();

    for (const chunk of chunks) {
      let queryRef: any = db.collection("tickets").where("status", "in", chunk);
      if (filters.userId) queryRef = queryRef.where("userId", "==", filters.userId);
      if (filters.connectorId) queryRef = queryRef.where("connectorId", "==", filters.connectorId);
      
      const limit = filters.limit ? Number(filters.limit) * 5 : 100;
      queryRef = queryRef.limit(limit);

      const snapshot = await queryRef.get();
      snapshot.docs.forEach((doc: any) => {
        allDocsMap.set(doc.id, {
          id: doc.id,
          ...doc.data()
        });
      });
    }

    return Array.from(allDocsMap.values());
  }

  async listProblematicJobs(filters: any): Promise<any[]> {
    const db = this.getDbSafe();
    const statuses = [
      "failed",
      "failed_local",
      "requires_manual_review",
      "invoice_recovery_pending",
      "invoice_recovery_retrying",
      "blocked",
      "captcha_required",
      "waiting_user_captcha",
      "manual_review_required"
    ];
    let queryRef: any = db.collection("invoice_jobs");
    queryRef = queryRef.where("status", "in", statuses);
    if (filters.userId) queryRef = queryRef.where("userId", "==", filters.userId);
    if (filters.connectorId) queryRef = queryRef.where("connectorId", "==", filters.connectorId);
    
    const snapshot = await queryRef.get();
    return snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));
  }

  async getJobByTicketId(ticketId: string): Promise<any> {
    const db = this.getDbSafe();
    const snapshot = await db.collection("invoice_jobs")
      .where("ticketId", "==", ticketId)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  async getJob(jobId: string): Promise<any> {
    const db = this.getDbSafe();
    const docSnap = await db.collection("invoice_jobs").doc(jobId).get();
    if (!docSnap.exists) return null;
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      status: data.status,
      attempts: data.attempts,
      retryCount: data.retryCount,
      recoveryAttemptCount: data.recoveryAttemptCount,
      maxRecoveryAttempts: data.maxRecoveryAttempts,
      lastError: data.lastError,
      lastErrorCode: data.lastErrorCode,
      updatedAt: data.updatedAt
    };
  }

  async getUser(userId: string) {
    const db = this.getDbSafe();
    const docSnap = await db.collection("users").doc(userId).get();
    if (!docSnap.exists) return null;
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      displayName: data.displayName
    };
  }

  async getConnector(connectorId: string) {
    const db = this.getDbSafe();
    const docSnap = await db.collection("connectors").doc(connectorId).get();
    if (!docSnap.exists) return null;
    return { id: docSnap.id, ...docSnap.data() };
  }

  async getInvoice(userId: string, invoiceId: string) {
    const db = this.getDbSafe();
    const docSnap = await db.collection("users").doc(userId).collection("invoices").doc(invoiceId).get();
    if (!docSnap.exists) return null;
    return { id: docSnap.id, ...docSnap.data() };
  }

  async updateSummary(ticketId: string, updates: any) {
    const db = this.getDbSafe();
    await db.collection("diagnostic_summaries").doc(ticketId).update(updates);
  }

  async createSummary(ticketId: string, summaryData: any): Promise<void> {
    const db = this.getDbSafe();
    await db.collection("diagnostic_summaries").doc(ticketId).set(summaryData);
  }

  async archiveRunnerDiagnostics(ticketId: string, archiveData: any): Promise<void> {
    const db = this.getDbSafe();
    const snapshot = await db.collection("runner_diagnostics")
      .where("ticketId", "==", ticketId)
      .get();
      
    if (snapshot.docs.length > 0) {
      const batch = db.batch();
      snapshot.docs.forEach((doc: any) => {
        batch.update(doc.ref, archiveData);
      });
      await batch.commit();
    }
  }

  async getInvoiceByUserIdAndId(userId: string, invoiceId: string): Promise<any> {
    const db = this.getDbSafe();
    const docSnap = await db.collection("users").doc(userId).collection("invoices").doc(invoiceId).get();
    if (!docSnap.exists) return null;
    return { id: docSnap.id, ...docSnap.data() };
  }

  async getSimilarProblems(problemSignature: string, ticketId: string): Promise<any[]> {
    const db = this.getDbSafe();
    const snapshot = await db.collection("diagnostic_summaries")
      .where("problemSignature", "==", problemSignature)
      .limit(5)
      .get();
    return snapshot.docs
      .map((d: any) => ({ id: d.id, ...d.data() }))
      .filter((d: any) => d.id !== ticketId);
  }

  async archiveCanonicalGroup(params: {
    ticketIds: string[];
    adminEmail: string;
    reason: string;
    comment: string | null;
  }) {
    const db = this.getDbSafe();
    const batch = db.batch();
    const timestamp = new Date().toISOString();

    for (const tid of params.ticketIds) {
      const ticketRef = db.collection("tickets").doc(tid);
      batch.set(ticketRef, {
        archived: true,
        archivedAt: timestamp,
        archivedBy: params.adminEmail,
        archivedReason: params.reason,
        archivedComment: params.comment,
        hiddenFromActiveDiagnostics: true,
        status: "archived",
        updatedAt: timestamp
      }, { merge: true });

      const summaryRef = db.collection("diagnostic_summaries").doc(tid);
      batch.set(summaryRef, {
        archivedAt: timestamp,
        archiveReason: params.reason,
        archiveComment: params.comment,
        archivedReasonText: `${params.reason}${params.comment ? `: ${params.comment}` : ""}`,
        archivedBy: params.adminEmail,
        visibility: "archived",
        diagnosticStatus: "archived",
        updatedAt: timestamp
      }, { merge: true });

      const runnerSnap = await db.collection("runner_diagnostics").where("ticketId", "==", tid).get();
      runnerSnap.docs.forEach(doc => {
        batch.update(doc.ref, {
          archivedAt: timestamp,
          archivedReason: `${params.reason}${params.comment ? `: ${params.comment}` : ""}`,
          archivedBy: params.adminEmail,
          visibility: "archived"
        });
      });
    }

    const jobsSnap = await db.collection("invoice_jobs").get();
    jobsSnap.docs.forEach(doc => {
      const jobData = doc.data();
      if (params.ticketIds.includes(jobData.ticketId)) {
        batch.update(doc.ref, {
          archivedAt: timestamp,
          archivedReason: `${params.reason}${params.comment ? `: ${params.comment}` : ""}`
        });
      }
    });

    await batch.commit();
  }

  async updateTicket(ticketId: string, updates: any): Promise<void> {
    const db = this.getDbSafe();
    await db.collection("tickets").doc(ticketId).update(updates);
  }

  async updateJob(jobId: string, updates: any): Promise<void> {
    const db = this.getDbSafe();
    await db.collection("invoice_jobs").doc(jobId).update(updates);
  }

  async createJob(jobData: any): Promise<string> {
    const db = this.getDbSafe();
    const docRef = db.collection("invoice_jobs").doc();
    await docRef.set(jobData);
    return docRef.id;
  }

  async addRunnerDiagnostic(event: any): Promise<string> {
    const db = this.getDbSafe();
    const docRef = await db.collection("runner_diagnostics").add(event);
    return docRef.id;
  }

  async createConnectorTask(task: any) {
    const db = this.getDbSafe();
    const docRef = await db.collection("connector_tasks").add(task);
    return docRef.id;
  }

  async writeAuditLog(log: any) {
    const db = this.getDbSafe();
    const docRef = db.collection("ai_audit_logs").doc();
    await docRef.set({
      requestId: docRef.id,
      ...log
    });
  }

  async writeAdminAuditLog(log: any) {
    const db = this.getDbSafe();
    const docRef = db.collection("admin_audit_logs").doc();
    await docRef.set({
      logId: docRef.id,
      ...log
    });
  }

  async getDiagnosticSummariesCount(): Promise<number> {
    const db = this.getDbSafe();
    const snap = await db.collection("diagnostic_summaries").get();
    return snap.docs.length;
  }

  async getAllUsers(): Promise<any[]> {
    const db = this.getDbSafe();
    const snap = await db.collection("users").get();
    return snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  }

  async getAllTickets(): Promise<any[]> {
    const db = this.getDbSafe();
    const snap = await db.collection("tickets").get();
    return snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  }

  async getAllConnectors(): Promise<any[]> {
    const db = this.getDbSafe();
    const snap = await db.collection("connectors").get();
    return snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  }

  async getAllJobs(): Promise<any[]> {
    const db = this.getDbSafe();
    const snap = await db.collection("invoice_jobs").get();
    return snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  }

  async getAllInvoices(): Promise<any[]> {
    const db = this.getDbSafe();
    const snap = await db.collectionGroup("invoices").get();
    return snap.docs.map((doc: any) => ({ id: doc.id, _path: doc.ref.path, ...doc.data() }));
  }

  async getAllAuthUsers(): Promise<any[]> {
    if (getApps().length === 0) return [];
    try {
      const { getAuth } = await import("firebase-admin/auth");
      const auth = getAuth(getApps()[0]);
      const listUsersResult = await auth.listUsers(1000);
      return listUsersResult.users.map(u => ({
        uid: u.uid,
        email: u.email || "",
        displayName: u.displayName || "",
        disabled: u.disabled,
        metadata: {
          creationTime: u.metadata.creationTime,
          lastSignInTime: u.metadata.lastSignInTime
        }
      }));
    } catch (e) {
      console.error("Error listing Auth users:", e);
      return [];
    }
  }

  async getAllFiscalProfiles(): Promise<any[]> {
    const db = this.getDbSafe();
    const snap = await db.collection("fiscalProfiles").get();
    return snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  }

  getCredentialsMetadata() {
    const projectId = getApps()[0]?.options.projectId || "factubolt";
    const credentialMode = process.env.GOOGLE_APPLICATION_CREDENTIALS ? "service_account" : (process.env.FIRESTORE_EMULATOR_HOST ? "emulator" : "unavailable");
    const emulatorHostEnabled = !!process.env.FIRESTORE_EMULATOR_HOST;
    return {
      projectId,
      credentialMode,
      emulatorHostEnabled
    };
  }
}
export const diagnosticsRepository = new DiagnosticsRepository();
