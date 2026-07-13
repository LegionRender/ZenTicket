var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server/routes/adminDiagnostics.routes.ts
var adminDiagnostics_routes_exports = {};
__export(adminDiagnostics_routes_exports, {
  default: () => adminDiagnostics_routes_default
});
module.exports = __toCommonJS(adminDiagnostics_routes_exports);
var import_express = require("express");

// server/repositories/diagnostics.repository.ts
var import_app = require("firebase-admin/app");
var import_firestore = require("firebase-admin/firestore");
var DiagnosticsRepository = class {
  getDbSafe() {
    const hasCreds = !!(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS);
    const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
    if ((0, import_app.getApps)().length === 0) {
      if (!hasCreds && !hasEmulator) {
        throw new Error("Admin Diagnostics backend no tiene conexi\xF3n v\xE1lida a Firestore. Configura credenciales o emulador.");
      }
      try {
        (0, import_app.initializeApp)({ projectId: "factubolt" });
      } catch (e) {
      }
    }
    if ((0, import_app.getApps)().length === 0) {
      throw new Error("Admin Diagnostics backend no tiene conexi\xF3n v\xE1lida a Firestore. Configura credenciales o emulador.");
    }
    return (0, import_firestore.getFirestore)((0, import_app.getApps)()[0], "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee");
  }
  async listSummaries(filters) {
    const db = this.getDbSafe();
    let queryRef = db.collection("diagnostic_summaries");
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
    if (filters.requiresManualReview !== void 0) {
      queryRef = queryRef.where("latestEvent.requiresManualReview", "==", filters.requiresManualReview);
    }
    if (filters.retryable !== void 0) {
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
    const items = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
    const nextCursor = items.length === limit ? items[items.length - 1].id : null;
    return {
      items,
      nextCursor
    };
  }
  async getSummary(ticketId) {
    const db = this.getDbSafe();
    const docSnap = await db.collection("diagnostic_summaries").doc(ticketId).get();
    if (!docSnap.exists) return null;
    return { id: docSnap.id, ...docSnap.data() };
  }
  async getTimeline(ticketId) {
    const db = this.getDbSafe();
    const snapshot = await db.collection("runner_diagnostics").where("ticketId", "==", ticketId).orderBy("createdAt", "asc").get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
  }
  async getTicket(ticketId) {
    const db = this.getDbSafe();
    const docSnap = await db.collection("tickets").doc(ticketId).get();
    if (!docSnap.exists) return null;
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      ...data
    };
  }
  async listProblematicTickets(filters) {
    const db = this.getDbSafe();
    if (filters.ticketId) {
      const docSnap = await db.collection("tickets").doc(filters.ticketId).get();
      if (!docSnap.exists) return [];
      return [{ id: docSnap.id, ...docSnap.data() }];
    }
    if (filters.ticketReference) {
      const snapFolio = await db.collection("tickets").where("folio", "==", filters.ticketReference).get();
      const snapBilling = await db.collection("tickets").where("portalFields.billingReference", "==", filters.ticketReference).get();
      const allDocsMap2 = /* @__PURE__ */ new Map();
      snapFolio.docs.forEach((doc) => {
        allDocsMap2.set(doc.id, { id: doc.id, ...doc.data() });
      });
      snapBilling.docs.forEach((doc) => {
        allDocsMap2.set(doc.id, { id: doc.id, ...doc.data() });
      });
      return Array.from(allDocsMap2.values());
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
    const allDocsMap = /* @__PURE__ */ new Map();
    for (const chunk of chunks) {
      let queryRef = db.collection("tickets").where("status", "in", chunk);
      if (filters.userId) queryRef = queryRef.where("userId", "==", filters.userId);
      if (filters.connectorId) queryRef = queryRef.where("connectorId", "==", filters.connectorId);
      const limit = filters.limit ? Number(filters.limit) * 5 : 100;
      queryRef = queryRef.limit(limit);
      const snapshot = await queryRef.get();
      snapshot.docs.forEach((doc) => {
        allDocsMap.set(doc.id, {
          id: doc.id,
          ...doc.data()
        });
      });
    }
    return Array.from(allDocsMap.values());
  }
  async listProblematicJobs(filters) {
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
    let queryRef = db.collection("invoice_jobs");
    queryRef = queryRef.where("status", "in", statuses);
    if (filters.userId) queryRef = queryRef.where("userId", "==", filters.userId);
    if (filters.connectorId) queryRef = queryRef.where("connectorId", "==", filters.connectorId);
    const snapshot = await queryRef.get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
  }
  async getJobByTicketId(ticketId) {
    const db = this.getDbSafe();
    const snapshot = await db.collection("invoice_jobs").where("ticketId", "==", ticketId).limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  }
  async getJob(jobId) {
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
  async getUser(userId) {
    const db = this.getDbSafe();
    const docSnap = await db.collection("users").doc(userId).get();
    if (!docSnap.exists) return null;
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      displayName: data.displayName
    };
  }
  async getConnector(connectorId) {
    const db = this.getDbSafe();
    const docSnap = await db.collection("connectors").doc(connectorId).get();
    if (!docSnap.exists) return null;
    return { id: docSnap.id, ...docSnap.data() };
  }
  async getInvoice(userId, invoiceId) {
    const db = this.getDbSafe();
    const docSnap = await db.collection("users").doc(userId).collection("invoices").doc(invoiceId).get();
    if (!docSnap.exists) return null;
    return { id: docSnap.id, ...docSnap.data() };
  }
  async updateSummary(ticketId, updates) {
    const db = this.getDbSafe();
    await db.collection("diagnostic_summaries").doc(ticketId).update(updates);
  }
  async createSummary(ticketId, summaryData) {
    const db = this.getDbSafe();
    await db.collection("diagnostic_summaries").doc(ticketId).set(summaryData);
  }
  async archiveRunnerDiagnostics(ticketId, archiveData) {
    const db = this.getDbSafe();
    const snapshot = await db.collection("runner_diagnostics").where("ticketId", "==", ticketId).get();
    if (snapshot.docs.length > 0) {
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, archiveData);
      });
      await batch.commit();
    }
  }
  async getInvoiceByUserIdAndId(userId, invoiceId) {
    const db = this.getDbSafe();
    const docSnap = await db.collection("users").doc(userId).collection("invoices").doc(invoiceId).get();
    if (!docSnap.exists) return null;
    return { id: docSnap.id, ...docSnap.data() };
  }
  async getSimilarProblems(problemSignature, ticketId) {
    const db = this.getDbSafe();
    const snapshot = await db.collection("diagnostic_summaries").where("problemSignature", "==", problemSignature).limit(5).get();
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.id !== ticketId);
  }
  async archiveCanonicalGroup(params) {
    const db = this.getDbSafe();
    const batch = db.batch();
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
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
      runnerSnap.docs.forEach((doc) => {
        batch.update(doc.ref, {
          archivedAt: timestamp,
          archivedReason: `${params.reason}${params.comment ? `: ${params.comment}` : ""}`,
          archivedBy: params.adminEmail,
          visibility: "archived"
        });
      });
    }
    const jobsSnap = await db.collection("invoice_jobs").get();
    jobsSnap.docs.forEach((doc) => {
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
  async updateTicket(ticketId, updates) {
    const db = this.getDbSafe();
    await db.collection("tickets").doc(ticketId).update(updates);
  }
  async updateJob(jobId, updates) {
    const db = this.getDbSafe();
    await db.collection("invoice_jobs").doc(jobId).update(updates);
  }
  async createJob(jobData) {
    const db = this.getDbSafe();
    const docRef = db.collection("invoice_jobs").doc();
    await docRef.set(jobData);
    return docRef.id;
  }
  async addRunnerDiagnostic(event) {
    const db = this.getDbSafe();
    const docRef = await db.collection("runner_diagnostics").add(event);
    return docRef.id;
  }
  async createConnectorTask(task) {
    const db = this.getDbSafe();
    const docRef = await db.collection("connector_tasks").add(task);
    return docRef.id;
  }
  async writeAuditLog(log) {
    const db = this.getDbSafe();
    const docRef = db.collection("ai_audit_logs").doc();
    await docRef.set({
      requestId: docRef.id,
      ...log
    });
  }
  async writeAdminAuditLog(log) {
    const db = this.getDbSafe();
    const docRef = db.collection("admin_audit_logs").doc();
    await docRef.set({
      logId: docRef.id,
      ...log
    });
  }
  async getDiagnosticSummariesCount() {
    const db = this.getDbSafe();
    const snap = await db.collection("diagnostic_summaries").get();
    return snap.docs.length;
  }
  async getAllUsers() {
    const db = this.getDbSafe();
    const snap = await db.collection("users").get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
  async getAllTickets() {
    const db = this.getDbSafe();
    const snap = await db.collection("tickets").get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
  async getAllConnectors() {
    const db = this.getDbSafe();
    const snap = await db.collection("connectors").get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
  async getAllJobs() {
    const db = this.getDbSafe();
    const snap = await db.collection("invoice_jobs").get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
  async getAllInvoices() {
    const db = this.getDbSafe();
    const snap = await db.collectionGroup("invoices").get();
    return snap.docs.map((doc) => ({ id: doc.id, _path: doc.ref.path, ...doc.data() }));
  }
  async getAllAuthUsers() {
    if ((0, import_app.getApps)().length === 0) return [];
    try {
      const { getAuth: getAuth2 } = await import("firebase-admin/auth");
      const auth = getAuth2((0, import_app.getApps)()[0]);
      const listUsersResult = await auth.listUsers(1e3);
      return listUsersResult.users.map((u) => ({
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
  async getAllFiscalProfiles() {
    const db = this.getDbSafe();
    const snap = await db.collection("fiscalProfiles").get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
  getCredentialsMetadata() {
    const projectId = (0, import_app.getApps)()[0]?.options.projectId || "factubolt";
    const credentialMode = process.env.GOOGLE_APPLICATION_CREDENTIALS ? "service_account" : process.env.FIRESTORE_EMULATOR_HOST ? "emulator" : "unavailable";
    const emulatorHostEnabled = !!process.env.FIRESTORE_EMULATOR_HOST;
    return {
      projectId,
      credentialMode,
      emulatorHostEnabled
    };
  }
};
var diagnosticsRepository = new DiagnosticsRepository();

// src/shared/billing/billingStatusVisuals.ts
function getBillingStatusVisual(input) {
  const norm = (input || "unknown").toLowerCase();
  const okStatuses = [
    "ready",
    "listo",
    "cfdi_validated",
    "sat_validated",
    "completed",
    "invoice_obtained",
    "sat_validation_pending_but_ok",
    // fallback
    "vigente"
  ];
  if (okStatuses.includes(norm) || norm === "ok" || norm === "validationstatus_sat_validated") {
    return {
      statusGroup: "OK",
      label: "Listo",
      shortLabel: "OK",
      tone: "green",
      bgColor: "#0B1F23",
      borderColor: "#0C3631",
      textColor: "#007A55",
      cssVars: {
        "--zt-status-bg": "var(--zt-ok-bg)",
        "--zt-status-border": "var(--zt-ok-border)",
        "--zt-status-text": "var(--zt-ok-text)"
      },
      className: "zt-status-ok",
      badgeClassName: "zt-badge-ok",
      cardClassName: "zt-card-ok",
      alertClassName: "zt-alert-ok",
      dotClassName: "zt-dot-ok",
      iconClassName: "text-[var(--zt-ok-text)]",
      icon: "CheckCircle",
      severityRank: 1
    };
  }
  const failedStatuses = [
    "failed",
    "automation_failed",
    "failed_blocking",
    "cfdi_validation_failed",
    "sat_validation_failed",
    "cfdi_invalid_xml",
    "cfdi_total_mismatch",
    "cfdi_rfc_mismatch",
    "sat_rejected",
    "portal_blocked",
    "runner_crashed",
    "failed_local",
    "blocked",
    "fallos",
    "error"
  ];
  if (failedStatuses.includes(norm) || norm === "error") {
    return {
      statusGroup: "FALLOS",
      label: "Error",
      shortLabel: "Fallos",
      tone: "red",
      bgColor: "#221220",
      borderColor: "#41182A",
      textColor: "#C70036",
      cssVars: {
        "--zt-status-bg": "var(--zt-error-bg)",
        "--zt-status-border": "var(--zt-error-border)",
        "--zt-status-text": "var(--zt-error-text)"
      },
      className: "zt-status-error",
      badgeClassName: "zt-badge-error",
      cardClassName: "zt-card-error",
      alertClassName: "zt-alert-error",
      dotClassName: "zt-dot-error",
      iconClassName: "text-[var(--zt-error-text)]",
      icon: "AlertCircle",
      severityRank: 5
    };
  }
  const queueStatuses = [
    "processing",
    "pending_local",
    "queued",
    "active_processing",
    "invoice_recovery_pending",
    "invoice_recovery_retrying",
    "waiting_user_captcha",
    "sat_validation_pending",
    "en_proceso",
    "cola",
    "in_process"
  ];
  if (queueStatuses.includes(norm) || norm === "processing" || norm === "pending") {
    return {
      statusGroup: "COLA",
      label: "En proceso",
      shortLabel: "Cola",
      tone: "blue",
      bgColor: "#0B162E",
      borderColor: "#1D3B7A",
      textColor: "#3B82F6",
      cssVars: {
        "--zt-status-bg": "var(--zt-queue-bg)",
        "--zt-status-border": "var(--zt-queue-border)",
        "--zt-status-text": "var(--zt-queue-text)"
      },
      className: "zt-status-queue",
      badgeClassName: "zt-badge-queue",
      cardClassName: "zt-card-queue",
      alertClassName: "zt-alert-process",
      dotClassName: "zt-dot-queue",
      iconClassName: "text-[var(--zt-queue-text)]",
      icon: "Clock",
      severityRank: 3
    };
  }
  const alertStatuses = [
    "requires_manual_review",
    "manual_review_required",
    "requires_field_correction",
    "already_invoiced_unverified",
    "invoice_missing_for_validated_cfdi",
    "missing_required_fields",
    "waiting_user_input",
    "duplicate_detected_without_xml",
    "attention",
    "alerta",
    "revisi\xF3n manual",
    "revisi\xF3n_manual",
    "correction_required"
  ];
  if (alertStatuses.includes(norm) || norm === "attention" || norm === "alerta" || norm === "revision_manual") {
    return {
      statusGroup: "ALERTAS",
      label: "Atenci\xF3n",
      shortLabel: "Alertas",
      tone: "amber",
      bgColor: "#1F1A0B",
      borderColor: "#4A3510",
      textColor: "#F59E0B",
      cssVars: {
        "--zt-status-bg": "var(--zt-alert-bg)",
        "--zt-status-border": "var(--zt-alert-border)",
        "--zt-status-text": "var(--zt-alert-text)"
      },
      className: "zt-status-alert",
      badgeClassName: "zt-badge-alert",
      cardClassName: "zt-card-alert",
      alertClassName: "zt-alert-attention",
      dotClassName: "zt-dot-alert",
      iconClassName: "text-[var(--zt-alert-text)]",
      icon: "AlertTriangle",
      severityRank: 4
    };
  }
  return {
    statusGroup: "ARCHIVADO",
    label: "Archivado",
    shortLabel: "Archivado",
    tone: "gray",
    bgColor: "#111827",
    borderColor: "#374151",
    textColor: "#9CA3AF",
    cssVars: {
      "--zt-status-bg": "var(--zt-archived-bg)",
      "--zt-status-border": "var(--zt-archived-border)",
      "--zt-status-text": "var(--zt-archived-text)"
    },
    className: "zt-status-archived",
    badgeClassName: "zt-badge-archived",
    cardClassName: "zt-card-archived",
    alertClassName: "zt-alert-archived",
    dotClassName: "zt-dot-archived",
    iconClassName: "text-[var(--zt-archived-text)]",
    icon: "Archive",
    severityRank: 2
  };
}

// src/workspace/utils/ticketHelpers.ts
var getDetailedReasonMsg = (ticket) => {
  if (!ticket) return "Error desconocido.";
  const isAlreadyInvoiced = ticket.reviewReasonCode === "TICKET_ALREADY_INVOICED" || ticket.reviewError?.errorCode === "TICKET_ALREADY_INVOICED" || ticket.reviewError?.runnerErrorCode === "TICKET_ALREADY_INVOICED" || ticket.reviewError?.reviewReasonCode === "TICKET_ALREADY_INVOICED" || ticket.wasAlreadyInvoiced || ticket.errorCode === "TICKET_ALREADY_INVOICED";
  if (isAlreadyInvoiced) {
    return `el folio ${ticket.folio || ticket.billingReference || "S/D"} ya fue emitido anteriormente.`;
  }
  if (ticket.status === "duplicate") {
    return `el folio ${ticket.folio || ticket.billingReference || "S/D"} es un duplicado en el sistema.`;
  }
  if (ticket.status === "failed_blocking") {
    return `el folio ${ticket.folio || ticket.billingReference || "S/D"} est\xE1 bloqueado.`;
  }
  if (ticket.status === "connector_auth_required") {
    return "El portal oficial de este comercio exige iniciar sesi\xF3n o crear una cuenta. No faltan datos del ticket; la facturaci\xF3n no puede continuar sin autorizaci\xF3n del usuario.";
  }
  if (["waiting_user_captcha", "blocked_by_captcha", "waiting_human_verification"].includes(ticket.status)) {
    return "El portal est\xE1 esperando el c\xF3digo de verificaci\xF3n mostrado en la captura.";
  }
  if (ticket.status === "training_required") {
    return "Este comercio a\xFAn no ten\xEDa automatizaci\xF3n. Estamos localizando su portal y preparando los datos que solicita. El primer proceso puede tardar algunos minutos.";
  }
  if (ticket.status === "training_pending_review") {
    return "Estamos preparando la facturaci\xF3n con este comercio. Tu ticket est\xE1 resguardado y continuar\xE1 autom\xE1ticamente cuando el flujo sea revisado.";
  }
  if (ticket.status === "training_approved_queueing") {
    return "El flujo de este comercio ya fue aprobado. Estamos enviando tu solicitud de factura autom\xE1ticamente.";
  }
  if (ticket.status === "training_approved_queue_blocked") {
    return "Estamos resolviendo una validaci\xF3n antes de enviar la solicitud al portal. Tu ticket sigue resguardado; no necesitas volver a subirlo.";
  }
  if (ticket.status === "portal_retry_required") {
    return "Tuvimos una complicaci\xF3n al localizar el portal de facturaci\xF3n y estamos trabajando en ello. Env\xEDa de nuevo el ticket para intentarlo otra vez.";
  }
  if (ticket.status === "connector_not_ready") {
    return "El conector de este comercio est\xE1 en mantenimiento t\xE9cnico o ajustes.";
  }
  if (ticket.status === "waiting_fiscal_profile") {
    return ticket.errorMsg || "El portal necesita tus datos fiscales para continuar con la factura. Por favor completa tu perfil en Mi Cuenta.";
  }
  if (ticket.status === "waiting_merchant_sync") {
    return ticket.errorMsg || "El comercio todav\xEDa est\xE1 validando este ticket. Podr\xE1s reintentarlo m\xE1s tarde.";
  }
  const revErr = ticket.reviewError;
  if (revErr) {
    if (revErr.naturalMessage) return revErr.naturalMessage;
    const code = revErr.runnerErrorCode || revErr.reviewReasonCode;
    if (code === "PORTAL_AJAX_TIMEOUT") return "El portal del comercio tard\xF3 demasiado en cargar informaci\xF3n secundaria.";
    if (code === "PORTAL_SELECTOR_NOT_FOUND") return "No pudimos localizar un elemento necesario en la p\xE1gina del comercio.";
    if (code === "PRIMEFACES_DROPDOWN_ERROR") return "No fue posible seleccionar tu R\xE9gimen Fiscal o Uso de CFDI.";
    if (code === "SAT_RFC_NOT_FOUND") return "El SAT reporta que tu RFC no est\xE1 registrado en su base de datos.";
    if (code === "INVALID_FISCAL_PROFILE_DATA") return "Los datos de tu perfil fiscal tienen un formato incorrecto o incompleto.";
    if (code === "TICKET_TOO_NEW") return "El comercio todav\xEDa est\xE1 validando este ticket. Podr\xE1s reintentarlo m\xE1s tarde.";
    if (code === "PORTAL_STRUCTURE_CHANGED") return "El portal de facturaci\xF3n del comercio cambi\xF3 su estructura o dise\xF1o.";
    if (code === "CAPTCHA_DETECTED") return "El portal del comercio solicita una verificaci\xF3n manual (CAPTCHA).";
    if (code === "TICKET_ALREADY_INVOICED") return "Este ticket ya ha sido facturado con anterioridad.";
    if (code === "PERIOD_EXPIRED") return "El periodo permitido por el comercio para facturar este ticket ya venci\xF3.";
    if (code === "INVALID_PORTAL_FIELD_VALUE") return revErr.portalErrorMessage || "Alguno de los datos del ticket es inv\xE1lido.";
    if (code === "CONNECTOR_NOT_FOUND") return "Este comercio a\xFAn no puede procesarse autom\xE1ticamente. Estamos revisando si puede agregarse.";
    if (code === "PORTAL_NO_XML") return "Este comercio requiere revisi\xF3n manual o no entreg\xF3 el XML/PDF en el proceso automatizado. ZenTicket no genera documentos sustitutos si el portal del comercio no entrega el XML.";
    if (code === "PORTAL_REJECTED_FOLIO") return "El portal no reconoci\xF3 el folio del ticket.";
    if (code === "PORTAL_REJECTED_TOTAL") return "El portal no reconoci\xF3 el total detectado.";
    if (code === "SAT_NOT_FOUND") return "El CFDI no fue localizado en los controles del SAT.";
    if (code === "SAT_CANCELED") return "El CFDI aparece cancelado ante el SAT.";
    if (code === "SAT_TIMEOUT") return "No pudimos verificar el CFDI ante el SAT en este momento.";
    if (code === "USER_REQUESTED_REVIEW") return "El usuario solicit\xF3 revisi\xF3n manual del ticket.";
    if (code === "CONNECTOR_TIMEOUT") return "El conector del comercio tard\xF3 m\xE1s de lo esperado en responder.";
    if (code === "PORTAL_ERROR") return revErr.reviewReasonMessage || "Ocurri\xF3 un error en el portal del comercio.";
    if (code === "CONNECTOR_RUNNER_NOT_AVAILABLE") return "El conector est\xE1 entrenado, pero el motor productivo de automatizaci\xF3n a\xFAn no est\xE1 disponible.";
    if (code === "CONNECTOR_SCHEMA_INVALID") return "El conector tiene una configuraci\xF3n incompleta y requiere revisi\xF3n t\xE9cnica.";
    if (code === "PORTAL_CHANGED") return "El portal de facturaci\xF3n cambi\xF3 y el conector necesita actualizar su navegaci\xF3n. No es necesario corregir los datos del ticket.";
    if (code === "PORTAL_TIMEOUT" || code === "RUNNER_TIMEOUT") return "El portal de facturaci\xF3n tard\xF3 m\xE1s de lo esperado. Conservamos el ticket para poder reintentar el proceso.";
    if (code === "CONNECTOR_NOT_PRODUCTION_READY") return "El conector de este comercio est\xE1 en validaci\xF3n t\xE9cnica y no est\xE1 listo para producci\xF3n.";
    if (code === "CONNECTOR_RESTRICTED") return "Este portal requiere credenciales especiales o permisos de acceso restringidos.";
    if (code === "CONNECTOR_BROKEN") return "El conector de este portal se encuentra temporalmente fuera de servicio por mantenimiento.";
    if (code === "PORTAL_FIELD_MAP_CHANGED") return "La estructura del portal oficial ha cambiado. Se ha programado un rediscovery t\xE9cnico.";
  }
  return ticket.errorMsg || "No fue posible completar la solicitud en el portal del comercio. Revisa los datos del ticket o solicita revisi\xF3n manual.";
};

// src/workspace/utils/billingStateHelpers.ts
var getBillingCanonicalState = (params) => {
  const t = params.ticket || {};
  const inv = params.invoice || {};
  const j = params.job || {};
  let displayTotal = 0;
  if (t.expectedTicketTotal && t.expectedTicketTotal > 0) {
    displayTotal = t.expectedTicketTotal;
  } else if (t.portalFields?.totalAmount && t.portalFields.totalAmount > 0) {
    displayTotal = t.portalFields.totalAmount;
  } else if (t.portalFields?.total && t.portalFields.total > 0) {
    displayTotal = t.portalFields.total;
  } else if (t.ticketData?.total && t.ticketData.total > 0) {
    displayTotal = t.ticketData.total;
  } else if (t.amountPaid && t.amountPaid > 0) {
    displayTotal = t.amountPaid;
  } else if (inv.total && inv.total > 0) {
    displayTotal = inv.total;
  } else if (t.total !== void 0 && t.total > 0) {
    displayTotal = t.total;
  } else if (inv.amount !== void 0 && inv.amount > 0) {
    displayTotal = inv.amount;
  } else if (t.total !== void 0) {
    displayTotal = t.total;
  } else if (inv.amount !== void 0) {
    displayTotal = inv.amount;
  } else {
    displayTotal = 0;
  }
  const isCfdiValidated = inv.isCfdiValidated === true || inv.cfdiValidated === true || t.status === "cfdi_validated" || t.status === "completed" || j.cfdiValidated === true;
  const hasXml = !!inv.xmlContent && inv.xmlContent.trim().length > 0 || !!inv.xmlStoragePath && inv.xmlStoragePath.trim().length > 0;
  const hasPdf = !!inv.pdfHtml && inv.pdfHtml.trim().length > 0 || !!inv.pdfStoragePath && inv.pdfStoragePath.trim().length > 0;
  const hasFolio = !!inv.uuid || !!inv.folioFiscal || !!j.result?.uuid;
  const hasErrorCode = (code) => {
    return inv.errorCode === code || inv.reviewReasonCode === code || inv.reviewError?.errorCode === code || inv.reviewError?.code === code || inv.reviewError?.runnerErrorCode === code || t.errorCode === code || t.reviewReasonCode === code || t.reviewError?.errorCode === code || t.reviewError?.code === code || t.reviewError?.runnerErrorCode === code || j.errorCode === code || j.reviewReasonCode === code;
  };
  const isAlreadyInvoiced = hasErrorCode("TICKET_ALREADY_INVOICED") || inv.wasAlreadyInvoiced === true || t.wasAlreadyInvoiced === true || j.wasAlreadyInvoiced === true;
  const isTotalMismatch = hasErrorCode("CFDI_TOTAL_MISMATCH") || t.status === "failed_blocking" && (t.errorMsg || "").toLowerCase().includes("total");
  const xmlRfcReceptor = inv.rfcReceptor || "";
  const expectedRfcReceptor = t.rfcReceptor || t.portalFields?.rfcReceptor || "";
  const isRfcMismatchDirect = !!xmlRfcReceptor && !!expectedRfcReceptor && xmlRfcReceptor.trim().toUpperCase() !== expectedRfcReceptor.trim().toUpperCase();
  const isRfcMismatch = hasErrorCode("CFDI_RFC_RECEPTOR_MISMATCH") || isRfcMismatchDirect || t.status === "failed_blocking" && (t.errorMsg || "").toLowerCase().includes("rfc");
  const isRfcEmisorMismatch = hasErrorCode("CFDI_RFC_EMISOR_MISMATCH");
  const isInvalidXml = hasErrorCode("CFDI_INVALID_XML");
  const isInvalidTotal = inv.total === 0 && displayTotal > 0;
  const satAttemptCount = inv.satAttemptCount ?? t.satAttemptCount ?? j.attempts ?? 0;
  const hasPendingRetries = satAttemptCount < 3 || !!(inv.nextSatValidationAt || t.nextSatValidationAt);
  const satInv = normalizeSatValidationState(inv, hasPendingRetries);
  const satTicket = normalizeSatValidationState(t, hasPendingRetries);
  const satJob = normalizeSatValidationState(j, hasPendingRetries);
  const isSatValid = satInv.isSatValid || satTicket.isSatValid || satJob.isSatValid;
  const isSatPending = satInv.isSatPending || satTicket.isSatPending || satJob.isSatPending;
  const isSatNotFound = satInv.isSatNotFound || satTicket.isSatNotFound || satJob.isSatNotFound;
  const isSatTimeout = satInv.isSatTimeout || satTicket.isSatTimeout || satJob.isSatTimeout;
  const isSatCancelled = satInv.isSatCancelled || satTicket.isSatCancelled || satJob.isSatCancelled;
  const satBadge = satInv.satBadge || satTicket.satBadge || satJob.satBadge;
  const satMessage = satInv.satMessage || satTicket.satMessage || satJob.satMessage;
  let canonicalStatus = "unknown";
  let badgeLabel = "REVISI\xD3N MANUAL";
  let badgeTone = "zt-badge-attention";
  let message = "Estado de facturaci\xF3n desconocido o no reconocido.";
  let isActive = false;
  let isReady = false;
  let isValidInvoice = false;
  let requiresManualReview = true;
  let canViewPdf = false;
  let canDownloadXml = false;
  let shouldAppearInReady = false;
  let shouldAppearInAttention = true;
  let shouldAppearInProcess = false;
  const invoiceRealIsValid = (!inv.id || !inv.id.startsWith("inv-fallback-")) && inv.synthetic !== true && (inv.isCfdiValidated === true || inv.cfdiValidated === true) && (inv.satValidated === true || inv.satStatus?.toLowerCase() === "vigente" || inv.satEstado?.toLowerCase() === "vigente" || inv.estadoCfdi?.toLowerCase() === "vigente" || inv.validationStatus === "sat_validated") && (!!inv.xmlContent || !!inv.xmlStoragePath) && (!!inv.uuid || !!inv.folioFiscal) && !isRfcMismatch && !isTotalMismatch && !isInvalidTotal;
  const ticketHasValidatedCfdi = t.status === "cfdi_validated" || t.isCfdiValidated === true || t.satValidated === true || t.validationStatus === "sat_validated" || t.satStatus?.toLowerCase() === "vigente";
  const satisfiesStrictRules = invoiceRealIsValid && (displayTotal > 0 || (t.expectedTicketTotal === 0 || t.total === 0));
  const isAlreadyInvoicedXmlNotRecovered = hasErrorCode("ALREADY_INVOICED_XML_NOT_RECOVERED") || t.status === "already_invoiced_unverified" || j.status === "already_invoiced_unverified" || t.reviewReasonCode === "ALREADY_INVOICED_XML_NOT_RECOVERED" || j.reviewReasonCode === "ALREADY_INVOICED_XML_NOT_RECOVERED";
  const isAlreadyInvoicedDetected = isAlreadyInvoiced || isAlreadyInvoicedXmlNotRecovered || t.status === "portal_already_invoiced_detected" || j.status === "portal_already_invoiced_detected" || t.status === "invoice_recovery_pending" || t.status === "invoice_recovery_retrying";
  const isRecoveryPending = t.status === "invoice_recovery_pending" || t.status === "invoice_recovery_retrying" || t.status === "portal_already_invoiced_detected" || j.id && j.status !== "failed" && j.status !== "succeeded" && (t.status === "invoice_recovery_pending" || t.status === "invoice_recovery_retrying" || isAlreadyInvoiced);
  if (isRfcMismatch) {
    canonicalStatus = "cfdi_rfc_mismatch";
    badgeLabel = "RFC INCORRECTO";
    badgeTone = "zt-badge-error";
    message = "La factura fue emitida con un RFC de receptor incorrecto.";
    shouldAppearInReady = false;
    shouldAppearInAttention = true;
    shouldAppearInProcess = false;
    requiresManualReview = true;
  } else if (isInvalidTotal) {
    canonicalStatus = "cfdi_invalid";
    badgeLabel = "CFDI INV\xC1LIDO";
    badgeTone = "zt-badge-error";
    message = "La factura tiene un total de $0.00 y no coincide con el ticket.";
    shouldAppearInReady = false;
    shouldAppearInAttention = true;
    shouldAppearInProcess = false;
    requiresManualReview = true;
  } else if (isTotalMismatch) {
    canonicalStatus = "cfdi_total_mismatch";
    badgeLabel = "TOTAL INCORRECTO";
    badgeTone = "zt-badge-error";
    message = "La factura fue emitida por un monto que no coincide con el ticket.";
    shouldAppearInReady = false;
    shouldAppearInAttention = true;
    shouldAppearInProcess = false;
    requiresManualReview = true;
  } else if (isSatCancelled) {
    canonicalStatus = "cfdi_cancelled";
    badgeLabel = "CFDI CANCELADO";
    badgeTone = "zt-badge-error";
    message = satMessage || "El XML obtenido se encuentra CANCELADO ante el SAT. Requiere revisi\xF3n manual.";
    shouldAppearInReady = false;
    shouldAppearInAttention = true;
    shouldAppearInProcess = false;
    requiresManualReview = true;
  } else if (isSatNotFound) {
    canonicalStatus = "cfdi_not_found_in_sat";
    badgeLabel = "CFDI NO LOCALIZADO";
    badgeTone = "zt-badge-error";
    message = satMessage || "El CFDI no fue localizado en los controles del SAT despu\xE9s de varios intentos. Requiere revisi\xF3n manual.";
    shouldAppearInReady = false;
    shouldAppearInAttention = true;
    shouldAppearInProcess = false;
    requiresManualReview = true;
  } else if (isSatPending) {
    canonicalStatus = "sat_validation_pending";
    badgeLabel = "VALIDANDO SAT";
    badgeTone = "zt-badge-process animate-pulse";
    message = satMessage || "El CFDI no ha sido localizado a\xFAn en el SAT. Reintentando validaci\xF3n autom\xE1ticamente.";
    isActive = true;
    shouldAppearInProcess = true;
    shouldAppearInAttention = false;
    shouldAppearInReady = false;
  } else if (isSatTimeout) {
    canonicalStatus = "sat_timeout";
    badgeLabel = "REVISI\xD3N MANUAL";
    badgeTone = "zt-badge-attention";
    message = satMessage || "No pudimos verificar el CFDI ante el SAT en este momento.";
    shouldAppearInReady = false;
    shouldAppearInAttention = true;
    shouldAppearInProcess = false;
    requiresManualReview = true;
  } else if (isInvalidXml) {
    canonicalStatus = "cfdi_invalid_xml";
    badgeLabel = "XML INV\xC1LIDO";
    badgeTone = "zt-badge-error";
    message = "La estructura XML de la factura no es v\xE1lida.";
    shouldAppearInReady = false;
    shouldAppearInAttention = true;
    shouldAppearInProcess = false;
    requiresManualReview = true;
  } else if (ticketHasValidatedCfdi && !invoiceRealIsValid) {
    canonicalStatus = "invoice_missing_for_validated_cfdi";
    badgeLabel = "SINCRONIZACI\xD3N PENDIENTE";
    badgeTone = "zt-badge-attention";
    message = "CFDI validado, pero falta sincronizar el documento de factura.";
    shouldAppearInReady = false;
    shouldAppearInAttention = true;
    shouldAppearInProcess = false;
    requiresManualReview = true;
    canViewPdf = false;
    canDownloadXml = false;
  } else if (satisfiesStrictRules) {
    canonicalStatus = "cfdi_validated";
    isReady = true;
    isValidInvoice = true;
    requiresManualReview = false;
    canViewPdf = hasPdf;
    canDownloadXml = hasXml;
    shouldAppearInReady = true;
    shouldAppearInAttention = false;
    shouldAppearInProcess = false;
    badgeLabel = isAlreadyInvoiced ? "YA FACTURADO" : "FACTURADO";
    badgeTone = isAlreadyInvoiced ? "zt-badge-attention" : "zt-badge-ok";
    message = "La factura ha sido emitida y validada exitosamente.";
  } else if (isAlreadyInvoicedDetected) {
    if (isRecoveryPending && !invoiceRealIsValid) {
      canonicalStatus = "invoice_recovery_pending";
      badgeLabel = "RECUPERANDO CFDI";
      badgeTone = "zt-badge-process animate-pulse";
      message = "El portal indica que este ticket ya fue facturado. ZenTicket est\xE1 intentando recuperar el XML/PDF para validarlo con SAT.";
      shouldAppearInReady = false;
      shouldAppearInProcess = true;
      shouldAppearInAttention = false;
      canDownloadXml = false;
      canViewPdf = false;
      isActive = true;
      requiresManualReview = false;
    } else {
      canonicalStatus = "already_invoiced_unverified";
      badgeLabel = "YA FACTURADO SIN XML";
      badgeTone = "zt-badge-attention";
      message = t.portalMessage || t.errorMsg || j.lastError || "El portal indica que este ticket ya fue facturado, pero ZenTicket no pudo recuperar ni validar el XML fiscal.";
      shouldAppearInReady = false;
      shouldAppearInProcess = false;
      shouldAppearInAttention = true;
      requiresManualReview = true;
      canDownloadXml = false;
      canViewPdf = false;
    }
  } else if (t.status === "failed_blocking") {
    canonicalStatus = "failed_blocking";
    badgeLabel = "BLOQUEADO";
    badgeTone = "zt-badge-error";
    message = "Ticket Bloqueado: " + (t.errorMsg || "no se puede continuar con la automatizaci\xF3n.");
  } else if (["training_required", "training_pending_review", "training_approved_queueing"].includes(t.status || "")) {
    canonicalStatus = "training";
    badgeLabel = "PREPARANDO FACTURA";
    badgeTone = "zt-badge-process";
    message = getDetailedReasonMsg(t);
    isActive = true;
    requiresManualReview = false;
    shouldAppearInReady = false;
    shouldAppearInProcess = true;
    shouldAppearInAttention = false;
  } else if (t.status === "portal_retry_required") {
    canonicalStatus = "portal_retry_required";
    badgeLabel = "NUEVO INTENTO";
    badgeTone = "zt-badge-attention";
    message = getDetailedReasonMsg(t);
    isActive = false;
    requiresManualReview = false;
    shouldAppearInReady = false;
    shouldAppearInProcess = true;
    shouldAppearInAttention = false;
  } else if (t.status === "requires_manual_review" || t.status === "review") {
    canonicalStatus = "requires_manual_review";
    badgeLabel = "REVISI\xD3N MANUAL";
    badgeTone = "zt-badge-attention";
    message = getDetailedReasonMsg(t);
  } else if (t.status === "invoice_obtained" && !isCfdiValidated) {
    canonicalStatus = "invoice_obtained_unverified";
    badgeLabel = "REVISI\xD3N MANUAL";
    badgeTone = "zt-badge-attention";
    message = "Esta factura requiere revisi\xF3n. El CFDI no fue validado correctamente o el portal indica que el ticket ya fue facturado.";
  } else if (["waiting_user_captcha", "blocked_by_captcha", "waiting_human_verification", "captcha_failed", "captcha_timeout"].includes(t.status || "") || j.status === "waiting_user_action") {
    canonicalStatus = "waiting_user_captcha";
    isActive = true;
    requiresManualReview = true;
    shouldAppearInAttention = true;
    shouldAppearInProcess = true;
    badgeLabel = "CAPTCHA REQUERIDO";
    badgeTone = "zt-badge-attention animate-pulse";
    message = getDetailedReasonMsg(t);
  } else if (isCfdiValidated) {
    canonicalStatus = "invoice_obtained_unverified";
    badgeLabel = "REVISI\xD3N MANUAL";
    badgeTone = "zt-badge-attention";
    message = "Esta factura requiere revisi\xF3n. El CFDI no fue validado correctamente o el portal indica que el ticket ya fue facturado.";
    shouldAppearInReady = false;
    shouldAppearInAttention = true;
    shouldAppearInProcess = false;
    requiresManualReview = true;
  } else {
    const isProcessing = ["runner_processing", "processing", "queued_for_runner", "pending_portal_submission", "submitted_to_merchant", "waiting_portal_result", "sat_verifying", "merchant_cfdi_downloaded"].includes(t.status || "") || j.id && j.status !== "failed" && j.status !== "succeeded";
    if (isProcessing) {
      const isQueued = t.status === "queued_for_runner";
      canonicalStatus = isQueued ? "queued" : "active_processing";
      isActive = true;
      requiresManualReview = false;
      shouldAppearInAttention = false;
      shouldAppearInProcess = true;
      badgeLabel = isQueued ? "EN COLA (JIT)" : "AUTOMATIZANDO";
      badgeTone = isQueued ? "zt-badge-archived" : "zt-badge-process";
      message = isQueued ? "El ticket est\xE1 en cola y comenzar\xE1 a procesarse en breve." : "Procesando de forma automatizada. Por favor espera.";
    } else {
      const hasControlFields = !!t.status || !!t.errorCode || !!t.reviewReasonCode || !!t.portalMessage || !!t.reviewError?.runnerErrorCode || !!inv.satStatus || !!inv.id || !!j.id || isAlreadyInvoiced;
      if (hasControlFields) {
        canonicalStatus = "requires_manual_review";
        shouldAppearInReady = false;
        shouldAppearInAttention = true;
        shouldAppearInProcess = false;
        requiresManualReview = true;
        badgeLabel = "REVISI\xD3N MANUAL";
        badgeTone = "zt-badge-attention";
        message = t.portalMessage || t.errorMsg || j.lastError || (t.errorCode ? `Error: ${t.errorCode}` : "Ocurri\xF3 un inconveniente con el procesamiento en el portal.");
      } else {
        canonicalStatus = "unknown";
        badgeLabel = "REVISI\xD3N MANUAL";
        badgeTone = "zt-badge-attention";
        message = "Estado de facturaci\xF3n desconocido o no reconocido.";
      }
    }
  }
  let finalMessage = message;
  const isAlreadyInvoicedMsg = hasErrorCode("TICKET_ALREADY_INVOICED") || hasErrorCode("ALREADY_INVOICED_XML_NOT_RECOVERED") || t.wasAlreadyInvoiced === true || inv.wasAlreadyInvoiced === true || j.wasAlreadyInvoiced === true || t.status === "already_invoiced_unverified";
  if (isAlreadyInvoicedMsg) {
    if (canonicalStatus === "invoice_recovery_pending") {
      finalMessage = "El portal indica que este ticket ya fue facturado. ZenTicket est\xE1 intentando recuperar el XML/PDF para validarlo con SAT.";
    } else {
      finalMessage = "El portal indica que este ticket ya fue facturado, pero ZenTicket no pudo recuperar ni validar el XML fiscal.";
    }
  } else {
    if (finalMessage === "Ocurri\xF3 un inconveniente con el procesamiento en el portal." || finalMessage === "Estado de facturaci\xF3n desconocido o no reconocido.") {
      const portalMsg = t.portalMessage ?? j.portalMessage ?? null;
      const reviewUserMsg = t.reviewError?.friendlyMessage ?? t.reviewError?.userMessage ?? t.reviewError?.message ?? null;
      const errorCatalogMsg = t.errorMsg ?? j.lastError ?? null;
      if (portalMsg) {
        finalMessage = portalMsg;
      } else if (reviewUserMsg) {
        finalMessage = reviewUserMsg;
      } else if (errorCatalogMsg) {
        finalMessage = errorCatalogMsg;
      }
    }
  }
  message = finalMessage;
  const visual = getBillingStatusVisual(canonicalStatus);
  badgeTone = visual.badgeClassName;
  return {
    canonicalStatus,
    isActive,
    isReady,
    isValidInvoice,
    requiresManualReview,
    canViewPdf,
    canDownloadXml,
    shouldAppearInReady,
    shouldAppearInAttention,
    shouldAppearInProcess,
    badgeLabel,
    badgeTone,
    message,
    displayTotal
  };
};
var normalizeKey = (key) => {
  if (typeof key !== "string") return String(key || "").trim().toUpperCase();
  let normalized = key.trim().toUpperCase().replace(/\s+/g, "").replace(/^TICKET#/g, "").replace(/^FOLIO#/g, "").replace(/^#/g, "");
  normalized = normalized.replace(/^INV-FALLBACK-/g, "").replace(/^INVFALLBACK/g, "").replace(/^INV_/g, "").replace(/^INV-/g, "").replace(/^SYN-/g, "");
  return normalized;
};
var CONNECTOR_REGISTRY = [
  {
    id: "oxxocadena",
    names: ["oxxo", "oxxo cadena", "cadena comercial oxxo", "cadena comercial oxxo, s.a. de c.v."],
    rfcs: ["cco8605231n4"],
    domains: ["oxxo.com"]
  },
  {
    id: "cinemex",
    names: ["cinemex"],
    rfcs: [],
    domains: ["cinemex.com"]
  },
  {
    id: "uber",
    names: ["uber"],
    rfcs: [],
    domains: ["uber.com"]
  },
  {
    id: "didi",
    names: ["didi"],
    rfcs: [],
    domains: ["didiglobal.com"]
  },
  {
    id: "walmart",
    names: ["walmart", "bodega aurrera", "sams", "sam's club", "nueva walmart"],
    rfcs: [],
    domains: ["walmartmexico.com.mx", "walmart.com.mx"]
  },
  {
    id: "costco",
    names: ["costco"],
    rfcs: [],
    domains: ["costco.com.mx"]
  },
  {
    id: "amazon",
    names: ["amazon"],
    rfcs: [],
    domains: ["amazon.com.mx"]
  },
  {
    id: "mercadolibre",
    names: ["mercadolibre", "mercado libre"],
    rfcs: [],
    domains: ["mercadolibre.com.mx"]
  }
];
var KNOWN_CONNECTOR_IDENTITY_FIELDS = {
  "oxxocadena": ["billingReference", "total", "fecha"],
  "walmart": ["billingReference", "total", "fecha"],
  "costco": ["billingReference", "total", "fecha"],
  "uber": ["billingReference", "total", "fecha"],
  "didi": ["billingReference", "total", "fecha"],
  "amazon": ["billingReference", "total", "fecha"],
  "mercadolibre": ["billingReference", "total", "fecha"],
  "cinemex": ["billingReference", "total", "fecha"]
};
var resolveConnectorId = (input) => {
  const clean = String(input || "").toLowerCase().trim();
  if (!clean || clean === "s/d" || clean === "unknown") return "";
  const directMatch = CONNECTOR_REGISTRY.find((c) => c.id === clean);
  if (directMatch) return directMatch.id;
  const rfcClean = clean.replace(/[^a-z0-9]/g, "");
  const rfcMatch = CONNECTOR_REGISTRY.find((c) => c.rfcs.some((r) => r.replace(/[^a-z0-9]/g, "") === rfcClean));
  if (rfcMatch) return rfcMatch.id;
  const domainMatch = CONNECTOR_REGISTRY.find((c) => c.domains.some((d) => clean.includes(d)));
  if (domainMatch) return domainMatch.id;
  const nameMatch = CONNECTOR_REGISTRY.find((c) => c.names.some((n) => clean.includes(n)));
  if (nameMatch) return nameMatch.id;
  return clean.replace(/[^a-z0-9]/g, "");
};
var getTicketTotal = (ticket) => {
  if (!ticket) return null;
  const val = ticket.portalFields?.total ?? ticket.expectedTicketTotal ?? ticket.total ?? null;
  if (val === null || val === void 0) return null;
  const parsed = parseFloat(String(val));
  return isNaN(parsed) ? null : parsed;
};
var getTicketDate = (ticket) => {
  if (!ticket) return null;
  const val = ticket.portalFields?.fecha ?? ticket.fechaCompra ?? ticket.fecha ?? null;
  if (!val) return null;
  return String(val).substring(0, 10);
};
var getTicketFolio = (ticket) => {
  if (!ticket) return null;
  const val = ticket.portalFields?.billingReference ?? ticket.reference ?? ticket.folio ?? null;
  if (!val) return null;
  return String(val).toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+/, "");
};
var getTicketCommerce = (ticket) => {
  if (!ticket) return null;
  return ticket.comercio ?? ticket.nombreEmisor ?? ticket.rfcEmisor ?? null;
};
var isSiblingTicket = (t1, t2, connectorMap) => {
  if (!t1 || !t2) return false;
  if (t1.userId !== t2.userId) return false;
  const srcId1 = t1.sourceTicketId || t1.ticketId;
  const srcId2 = t2.sourceTicketId || t2.ticketId;
  if (srcId1 && srcId2 && srcId1 === srcId2) {
    return true;
  }
  if (t1.id && (t2.ticketId === t1.id || t2.sourceTicketId === t1.id)) {
    return true;
  }
  if (t2.id && (t1.ticketId === t2.id || t1.sourceTicketId === t2.id)) {
    return true;
  }
  if (t1.transactionKey && t2.transactionKey && t1.transactionKey === t2.transactionKey) {
    return true;
  }
  const conn1 = resolveConnectorId(t1.connectorId || getTicketCommerce(t1) || "");
  const conn2 = resolveConnectorId(t2.connectorId || getTicketCommerce(t2) || "");
  if (!conn1 || conn1 !== conn2) return false;
  const folio1 = getTicketFolio(t1);
  const folio2 = getTicketFolio(t2);
  if (!folio1 || folio1 !== folio2) return false;
  const total1 = getTicketTotal(t1);
  const total2 = getTicketTotal(t2);
  if (total1 === null || total2 === null || total1 !== total2) return false;
  const identityFields = connectorMap?.[conn1] || KNOWN_CONNECTOR_IDENTITY_FIELDS[conn1] || ["billingReference", "total", "fecha"];
  const dateIsRequired = identityFields.includes("fecha");
  if (dateIsRequired) {
    const date1 = getTicketDate(t1);
    const date2 = getTicketDate(t2);
    if (!date1 || !date2 || date1 !== date2) {
      return false;
    }
  }
  return true;
};
var getBillingVisualKey = (params) => {
  const t = params.ticket || {};
  const inv = params.invoice || {};
  const j = params.job || {};
  const srcId = t.sourceTicketId || t.ticketId || inv.sourceTicketId || inv.ticketId || j.sourceTicketId || j.ticketId;
  if (srcId && String(srcId).trim().length > 0 && String(srcId).trim().toUpperCase() !== "S/D") {
    return normalizeKey(srcId);
  }
  const txKey = t.transactionKey || inv.transactionKey || j.transactionKey;
  if (txKey && String(txKey).trim().length > 0) {
    return normalizeKey(txKey);
  }
  if (t.canonicalTicketId && String(t.canonicalTicketId).trim().length > 0 && String(t.canonicalTicketId).trim().toUpperCase() !== "S/D") {
    return normalizeKey(t.canonicalTicketId);
  }
  if (inv.canonicalTicketId && String(inv.canonicalTicketId).trim().length > 0 && String(inv.canonicalTicketId).trim().toUpperCase() !== "S/D") {
    return normalizeKey(inv.canonicalTicketId);
  }
  if (j.canonicalTicketId && String(j.canonicalTicketId).trim().length > 0 && String(j.canonicalTicketId).trim().toUpperCase() !== "S/D") {
    return normalizeKey(j.canonicalTicketId);
  }
  const uId = t.userId || inv.userId || j.userId || "";
  const commerce = getTicketCommerce(t) || inv.nombreEmisor || j.comercio || "";
  const ref = t.reference || t.folio || t.portalFields?.billingReference || inv.ticketReference || inv.reference || j.ticketReference || "";
  const date = getTicketDate(t) || inv.fecha || "";
  const total = getTicketTotal(t) || inv.total || "";
  if (uId && commerce && ref && date && total) {
    const cleanCommerce = resolveConnectorId(commerce);
    const cleanRef = String(ref).toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+/, "");
    const cleanDate = date;
    const cleanTotal = parseFloat(String(total)).toFixed(2);
    return `legacy_${uId}_${cleanCommerce}_${cleanRef}_${cleanDate}_${cleanTotal}`;
  }
  const explicitUuid = inv.folioFiscal || inv.uuid || j.result?.uuid || inv.invoiceId;
  if (explicitUuid && String(explicitUuid).trim().length > 0 && String(explicitUuid).trim().toUpperCase() !== "S/D") {
    return normalizeKey(explicitUuid);
  }
  const normalizedT = t.id ? normalizeKey(t.id) : null;
  const normalizedInv = inv.id ? normalizeKey(inv.id) : null;
  const normalizedJ = j.id ? normalizeKey(j.id) : null;
  if (normalizedT && normalizedT !== "UNKNOWN_KEY" && normalizedT !== "S/D") return normalizedT;
  if (normalizedInv && normalizedInv !== "UNKNOWN_KEY" && normalizedInv !== "S/D") return normalizedInv;
  if (normalizedJ && normalizedJ !== "UNKNOWN_KEY" && normalizedJ !== "S/D") return normalizedJ;
  if (ref && String(ref).trim().length > 0 && String(ref).trim().toUpperCase() !== "S/D") {
    return normalizeKey(ref);
  }
  return "UNKNOWN_KEY";
};
var getItemDedupeScore = (item) => {
  const t = item.ticket || {};
  const inv = item.invoice || {};
  const j = item.job || {};
  let score = 0;
  const isRealTicket = t.id && !t.id.startsWith("syn-") && t.status !== "deleted" && t.hiddenFromUser !== true;
  if (isRealTicket) {
    score += 100;
    if (t.reference && t.reference !== "S/D") {
      score += 10;
    }
    if (t.status !== "extracted") {
      score += 50;
    }
  }
  const isRealInvoice = inv.id && !inv.id.startsWith("inv-fallback-") && !inv.synthetic;
  const isCfdiValidated = inv.isCfdiValidated === true || inv.cfdiValidated === true;
  if (isRealInvoice) {
    score += 80;
    if (isCfdiValidated) {
      score += 20;
    }
  }
  if (j.id) {
    score += 60;
  }
  return score || 10;
};
var dedupeBillingItems = (items) => {
  const groups = {};
  items.forEach((item) => {
    const key = getBillingVisualKey({ ticket: item.ticket, invoice: item.invoice, job: item.job });
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
  });
  const deduped = [];
  Object.keys(groups).forEach((key) => {
    const groupItems = groups[key];
    groupItems.sort((a, b) => getItemDedupeScore(b) - getItemDedupeScore(a));
    const bestItem = { ...groupItems[0] };
    groupItems.slice(1).forEach((other) => {
      if (!bestItem.ticket && other.ticket) {
        bestItem.ticket = other.ticket;
      }
      if (!bestItem.invoice && other.invoice) {
        bestItem.invoice = other.invoice;
      }
      if (!bestItem.job && other.job) {
        bestItem.job = other.job;
      }
    });
    deduped.push(bestItem);
  });
  return deduped;
};
var normalizeSatValidationState = (doc, hasPendingRetries) => {
  if (!doc) {
    return {
      isSatValid: false,
      isSatPending: false,
      isSatNotFound: false,
      isSatTimeout: false,
      isSatCancelled: false,
      satBadge: "",
      satMessage: ""
    };
  }
  const hasCode = (code) => {
    return doc.errorCode === code || doc.reviewReasonCode === code || doc.reviewError?.errorCode === code || doc.reviewError?.code === code || doc.reviewError?.runnerErrorCode === code;
  };
  const satValidated = doc.satValidated === true || doc.validationStatus === "sat_validated" || doc.cfdiValidationStatus === "sat_validated" || doc.satValidationStatus === "sat_validated" || doc.satStatus?.toLowerCase() === "vigente" || doc.satEstado?.toLowerCase() === "vigente" || doc.estadoCfdi?.toLowerCase() === "vigente" || doc.satMessage?.toLowerCase().includes("vigente");
  const isCancelled = doc.satStatus?.toLowerCase() === "cancelado" || doc.satEstado?.toLowerCase() === "cancelado" || doc.estadoCfdi?.toLowerCase() === "cancelado" || hasCode("SAT_CANCELED") || hasCode("CFDI_CANCELED") || doc.satMessage?.toLowerCase().includes("cancelado");
  const isNotFound = doc.satStatus?.toLowerCase() === "no encontrado" || doc.satStatus?.toLowerCase() === "not_found" || doc.satEstado?.toLowerCase() === "no localizado" || hasCode("SAT_NOT_FOUND") || hasCode("CFDI_NOT_FOUND_IN_SAT") || doc.satMessage?.toLowerCase().includes("no localizado") || doc.satMessage?.toLowerCase().includes("cfdi no localizado");
  const isTimeout = doc.satStatus?.toLowerCase() === "timeout" || hasCode("SAT_TIMEOUT") || hasCode("SAT_VALIDATION_TIMEOUT") || doc.satMessage?.toLowerCase().includes("timeout") || doc.satMessage?.toLowerCase().includes("no pudimos verificar");
  const satAttemptCount = doc.satAttemptCount ?? doc.attempts ?? 0;
  const pending = hasPendingRetries !== void 0 ? hasPendingRetries : satAttemptCount < 3 || !!doc.nextSatValidationAt;
  let isSatValid = satValidated && !isCancelled && !isNotFound && !isTimeout;
  let isSatPending = false;
  let isSatNotFound = false;
  let isSatTimeout = isTimeout;
  let isSatCancelled = isCancelled;
  let satBadge = "";
  let satMessage = doc.satMessage || doc.reviewReasonMessage || "";
  if (isNotFound) {
    if (pending) {
      isSatPending = true;
      satBadge = "VALIDANDO SAT";
      if (!satMessage) satMessage = "El CFDI no ha sido localizado a\xFAn en el SAT. Reintentando validaci\xF3n autom\xE1ticamente.";
    } else {
      isSatNotFound = true;
      satBadge = "CFDI NO LOCALIZADO";
      if (!satMessage) satMessage = "El CFDI no fue localizado en los controles del SAT despu\xE9s de varios intentos. Requiere revisi\xF3n manual.";
    }
  } else if (isCancelled) {
    satBadge = "CFDI CANCELADO";
    if (!satMessage) satMessage = "El XML obtenido se encuentra CANCELADO ante el SAT. Requiere revisi\xF3n manual.";
  } else if (isTimeout) {
    satBadge = "REVISI\xD3N MANUAL";
    if (!satMessage) satMessage = "No pudimos verificar el CFDI ante el SAT en este momento.";
  } else if (isSatValid) {
    satBadge = "FACTURADO";
    if (!satMessage) satMessage = "La factura ha sido emitida y validada exitosamente.";
  }
  return {
    isSatValid,
    isSatPending,
    isSatNotFound,
    isSatTimeout,
    isSatCancelled,
    satBadge,
    satMessage
  };
};
var resolveRelatedBillingDocs = (params) => {
  const tickets = params.tickets || [];
  const invoices = params.invoices || [];
  const jobs = params.jobs || [];
  let t = params.ticket || null;
  let inv = params.invoice || null;
  let j = params.job || null;
  const userId = t?.userId || inv?.userId || j?.userId || null;
  const matchUser = (doc) => {
    if (!userId) return true;
    if (doc.userId && doc.userId !== userId) return false;
    return true;
  };
  const cleanKey = (val) => {
    if (typeof val !== "string") return "";
    return val.trim().toUpperCase().replace(/\s+/g, "").replace(/^(TICKET#|FOLIO#|SYN-|INV-FALLBACK-|INV-)/, "");
  };
  const refMatches = (docA, docB) => {
    const refA = docA.reference || docA.ticketNumber || docA.ticketId || "";
    const refB = docB.reference || docB.ticketNumber || docB.ticketId || "";
    const cleanedA = cleanKey(refA);
    const cleanedB = cleanKey(refB);
    return !!cleanedA && cleanedA === cleanedB;
  };
  if (t) {
    if (!inv) {
      inv = invoices.find((i) => matchUser(i) && (i.sourceTicketId === t.id || i.ticketId === t.id || t.invoiceId === i.id || t.invoiceId && (t.invoiceId === i.uuid || t.invoiceId === i.folioFiscal))) || null;
      if (!inv) {
        inv = invoices.find((i) => matchUser(i) && refMatches(t, i)) || null;
      }
    }
    if (!j) {
      j = jobs.find((job) => matchUser(job) && (job.ticketId === t.id || inv && job.result?.uuid && (job.result.uuid === inv.uuid || job.result.uuid === inv.folioFiscal))) || null;
      if (!j) {
        j = jobs.find((job) => matchUser(job) && refMatches(t, job)) || null;
      }
    }
  }
  if (inv) {
    if (!t) {
      t = tickets.find((ticket) => matchUser(ticket) && (inv.sourceTicketId === ticket.id || inv.ticketId === ticket.id || ticket.invoiceId === inv.id || inv.uuid && ticket.invoiceId === inv.uuid || inv.folioFiscal && ticket.invoiceId === inv.folioFiscal)) || null;
      if (!t) {
        t = tickets.find((ticket) => matchUser(ticket) && refMatches(inv, ticket)) || null;
      }
    }
    if (!j) {
      j = jobs.find((job) => matchUser(job) && (t && job.ticketId === t.id || job.result?.uuid && (job.result.uuid === inv.uuid || job.result.uuid === inv.folioFiscal))) || null;
      if (!j) {
        j = jobs.find((job) => matchUser(job) && refMatches(inv, job)) || null;
      }
    }
  }
  if (j) {
    if (!t) {
      t = tickets.find((ticket) => matchUser(ticket) && j.ticketId === ticket.id) || null;
      if (!t) {
        t = tickets.find((ticket) => matchUser(ticket) && refMatches(j, ticket)) || null;
      }
    }
    if (!inv) {
      inv = invoices.find((i) => matchUser(i) && (t && (i.sourceTicketId === t.id || i.ticketId === t.id) || j.result?.uuid && (j.result.uuid === i.uuid || j.result.uuid === i.folioFiscal))) || null;
      if (!inv) {
        inv = invoices.find((i) => matchUser(i) && refMatches(j, i)) || null;
      }
    }
  }
  return { ticket: t, invoice: inv, job: j };
};
var selectDiagnosticAttempt = (params) => {
  const { canonicalTicketId, memberTicketIds, jobs } = params;
  const filteredJobs = jobs.filter((j) => {
    if (!j) return false;
    const matchesTicket = j.ticketId === canonicalTicketId || memberTicketIds.includes(j.ticketId);
    if (!matchesTicket) return false;
    if (j.archived === true || j.status === "archived") return false;
    return true;
  });
  if (filteredJobs.length === 0) return null;
  const getJobScore = (job) => {
    let score = 0;
    const isFailedOrBlocked = ["failed", "blocked", "failed_blocking", "error"].includes(job.status);
    if (isFailedOrBlocked) score += 1e3;
    const hasEvents = Array.isArray(job.events) && job.events.length > 0;
    const hasTimeline = Array.isArray(job.timeline) && job.timeline.length > 0;
    const hasError = !!(job.technicalError || job.lastError || job.errorMsg);
    const hasScreenshot = !!(job.evidenceScreenshotPath || job.screenshot);
    if (hasEvents || hasTimeline) score += 100;
    if (hasError) score += 50;
    if (hasScreenshot) score += 50;
    return score;
  };
  const getJobTime = (job) => {
    const d = job.updatedAt || job.createdAt || 0;
    return d ? new Date(d).getTime() : 0;
  };
  filteredJobs.sort((a, b) => {
    const scoreA = getJobScore(a);
    const scoreB = getJobScore(b);
    if (scoreA !== scoreB) return scoreB - scoreA;
    const timeA = getJobTime(a);
    const timeB = getJobTime(b);
    if (timeA !== timeB) return timeB - timeA;
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
  return filteredJobs[0];
};
var buildUserTicketsView = (params) => {
  const rawTickets = params.tickets || [];
  const rawInvoices = params.invoices || [];
  const rawJobs = params.jobs || [];
  const rawConnectors = params.connectors || [];
  const currentUserId = params.userId || params.fiscalProfile?.userId || "";
  const displayName = params.userDisplayName || "Usuario";
  const emailMasked = params.userEmailMasked || "S/D";
  const connectorMap = {};
  rawConnectors.forEach((c) => {
    if (c?.id) {
      const fields = c.identityFields || (c.extractionContract?.requiredPortalFields || []).map((f) => f.canonicalKey);
      if (Array.isArray(fields) && fields.length > 0) {
        connectorMap[c.id] = fields;
      }
    }
  });
  const activeTickets = rawTickets.filter((t) => {
    if (!t) return false;
    if (currentUserId && t.userId !== currentUserId) return false;
    if (t.hiddenFromUser === true) return false;
    if (t.deletedAt) return false;
    if (t.status === "deleted" || t.status === "hidden" || t.status === "orphaned" || t.status === "archived") return false;
    if (t.archived === true || t.hiddenFromActiveDiagnostics === true) return false;
    return true;
  });
  const activeInvoices = rawInvoices.filter((inv) => {
    if (!inv) return false;
    if (currentUserId && inv.userId !== currentUserId) return false;
    const isRoot = inv._path ? inv._path.split("/").length === 2 : false;
    if (isRoot) return true;
    if (inv.hiddenFromUser === true) return false;
    if (inv.linkedTicketDeleted === true) return false;
    if (inv.synthetic === true) return false;
    if (inv.status === "deleted") return false;
    if (inv.id && (inv.id.startsWith("inv-fallback-") || inv.id.startsWith("syn-"))) return false;
    return true;
  });
  const activeJobs = rawJobs.filter((j) => {
    if (!j) return false;
    if (currentUserId && j.userId !== currentUserId) return false;
    if (j.hiddenFromUser === true) return false;
    if (j.status === "deleted") return false;
    return true;
  });
  const ticketGroups = [];
  activeTickets.forEach((t) => {
    let added = false;
    for (const group of ticketGroups) {
      if (isSiblingTicket(group[0], t, connectorMap)) {
        group.push(t);
        added = true;
        break;
      }
    }
    if (!added) {
      ticketGroups.push([t]);
    }
  });
  ticketGroups.forEach((group) => {
    let canonical = group.find((t) => t.canonicalTicketId && t.canonicalTicketId === t.id);
    if (!canonical) {
      canonical = group.find((t) => activeJobs.some((j) => j.ticketId === t.id));
    }
    if (!canonical) {
      canonical = [...group].sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeA - timeB;
      })[0];
    }
    const memberIds = group.map((gt) => gt.id);
    group.forEach((t) => {
      t.canonicalTicketId = canonical.id;
      t.memberTicketIds = memberIds;
    });
  });
  const pairedItems = [];
  const processedTicketIds = /* @__PURE__ */ new Set();
  const processedInvoiceIds = /* @__PURE__ */ new Set();
  activeInvoices.forEach((inv) => {
    const resolved = resolveRelatedBillingDocs({
      invoice: inv,
      tickets: activeTickets,
      invoices: activeInvoices,
      jobs: activeJobs
    });
    if (resolved.ticket) processedTicketIds.add(resolved.ticket.id);
    processedInvoiceIds.add(inv.id);
    pairedItems.push(resolved);
  });
  activeTickets.forEach((t) => {
    if (processedTicketIds.has(t.id)) return;
    const resolved = resolveRelatedBillingDocs({
      ticket: t,
      tickets: activeTickets,
      invoices: activeInvoices,
      jobs: activeJobs
    });
    if (resolved.ticket) processedTicketIds.add(resolved.ticket.id);
    if (resolved.invoice) processedInvoiceIds.add(resolved.invoice.id);
    pairedItems.push(resolved);
  });
  const dedupedItems = dedupeBillingItems(pairedItems);
  dedupedItems.forEach((item) => {
    const t = item.ticket || {};
    const memberTicketIds = t.memberTicketIds || [t.id].filter(Boolean);
    const canonicalTicketId = t.canonicalTicketId || t.id || "";
    const selectedJob = selectDiagnosticAttempt({
      canonicalTicketId,
      memberTicketIds,
      jobs: activeJobs
    });
    item.job = selectedJob;
  });
  const items = dedupedItems.map((item) => {
    const canonicalState = getBillingCanonicalState({ ticket: item.ticket, invoice: item.invoice, job: item.job });
    const visualKey = getBillingVisualKey({ ticket: item.ticket, invoice: item.invoice, job: item.job });
    const isRoot = item.invoice?._path ? item.invoice._path.split("/").length === 2 : false;
    const relatedTicket = item.ticket || item.invoice && rawTickets.find((t) => t.id === item.invoice.ticketId || t.id === item.invoice.sourceTicketId);
    const isLinkedTicketDeleted = !relatedTicket || relatedTicket.status === "deleted" || relatedTicket.deletedAt || relatedTicket.hiddenFromUser === true;
    const isLegacyRoot = isRoot && (isLinkedTicketDeleted || item.invoice.legacyRootInvoice === true || item.invoice.hiddenFromUser === true || item.invoice.linkedTicketDeleted === true);
    let bucket = "in_process";
    const isFailedStatus = ["failed", "failed_blocking", "cfdi_validation_failed", "sat_validation_failed", "automation_failed"].includes(canonicalState.canonicalStatus);
    if (isLegacyRoot) {
      bucket = "archived";
    } else if (canonicalState.shouldAppearInReady && canonicalState.isValidInvoice) {
      bucket = "ready";
    } else if (isFailedStatus) {
      bucket = "failed";
    } else if (canonicalState.canonicalStatus === "requires_field_correction") {
      bucket = "correction_required";
    } else if (canonicalState.shouldAppearInAttention) {
      bucket = "attention";
    } else if (canonicalState.shouldAppearInProcess) {
      bucket = "in_process";
    } else {
      bucket = "archived";
    }
    const ticketRef = item.ticket?.folio || item.ticket?.portalFields?.billingReference || item.invoice?.ticketReference || item.invoice?.folioFiscal || "S/D";
    return {
      visualKey,
      ticketId: item.ticket?.id || item.invoice?.ticketId || null,
      canonicalTicketId: item.ticket?.canonicalTicketId || item.ticket?.id || null,
      memberTicketIds: item.ticket?.memberTicketIds || [item.ticket?.id].filter(Boolean),
      ticketReference: ticketRef,
      invoiceId: item.invoice?.id || null,
      jobId: item.job?.id || null,
      selectedJobId: item.job?.id || null,
      relatedJobIds: activeJobs.filter((j) => (item.ticket?.memberTicketIds || []).includes(j.ticketId)).map((j) => j.id),
      portal: item.ticket?.nombreEmisor || item.invoice?.nombreEmisor || "Emisor",
      connectorId: item.ticket?.connectorId || item.job?.connectorId || resolveConnectorId(item.ticket?.nombreEmisor || item.invoice?.nombreEmisor || ""),
      amount: canonicalState.displayTotal,
      date: item.ticket?.createdAt || item.invoice?.createdAt || item.job?.createdAt || null,
      canonicalStatus: isLegacyRoot ? "archived" : canonicalState.canonicalStatus,
      badgeLabel: isLegacyRoot ? "TICKET ELIMINADO" : canonicalState.badgeLabel,
      message: isLegacyRoot ? "Root invoice linked to deleted ticket" : canonicalState.message,
      bucket,
      canDownloadXml: canonicalState.canDownloadXml,
      canViewPdf: canonicalState.canViewPdf,
      sourceType: isLegacyRoot ? "legacy_root" : item.invoice ? "materialized_success" : item.job ? "derived_from_job" : "derived_from_ticket",
      reasonIncluded: isLegacyRoot ? "Root invoice linked to deleted ticket" : canonicalState.message,
      legacyRootInvoice: isRoot,
      linkedTicketDeleted: isLinkedTicketDeleted,
      hiddenFromUser: item.invoice?.hiddenFromUser === true || isLinkedTicketDeleted
    };
  });
  const counts = {
    totalVisible: items.filter((x) => x.bucket !== "archived").length,
    inProcess: items.filter((x) => x.bucket === "in_process").length,
    ready: items.filter((x) => x.bucket === "ready").length,
    attention: items.filter((x) => x.bucket === "attention").length,
    failed: items.filter((x) => x.bucket === "failed").length,
    correctionRequired: items.filter((x) => x.bucket === "correction_required").length,
    archived: items.filter((x) => x.bucket === "archived").length
  };
  return {
    userId: currentUserId,
    userDisplayName: displayName,
    userEmailMasked: emailMasked,
    items,
    counts
  };
};

// server/services/adminUserVisibility.service.ts
var PROTECTED_EMAILS = [
  "1985fama@gmail.com",
  "fluczer.dg@gmail.com",
  "legionrender@gmail.com",
  "renderbrands@gmail.com"
];
function classifyAdminUser(user) {
  const email = (user.email || "").toLowerCase();
  const displayName = (user.userDisplayName || user.displayName || "").toLowerCase();
  const uid = (user.userId || "").toLowerCase();
  if (PROTECTED_EMAILS.includes(email)) {
    return "protected_user";
  }
  if (user.source && !user.source.auth && user.source.tickets) {
    return "orphan_activity";
  }
  const isMockName = displayName.includes("mock") || displayName.includes("debug") || displayName.includes("test") || displayName.includes("jx4pe");
  const isMockEmail = email.includes("mock") || email.includes("debug") || email.includes("test") || email.includes("jx4pe") || email === "" || email === "s/d";
  const isMockUid = uid.includes("mock") || uid.includes("debug") || uid.includes("test");
  if (isMockName || isMockEmail || isMockUid) {
    return "mock_or_debug";
  }
  if (user.source && (!user.source.firestoreProfile || !user.source.fiscalProfile)) {
    return "incomplete_profile";
  }
  return "real_user";
}
function getUserVisibilityReason(user) {
  const status = classifyAdminUser(user);
  switch (status) {
    case "protected_user":
      return "Protected: email in administrator whitelist";
    case "orphan_activity":
      return "Orphan activity: tickets exist but no valid Auth user was found";
    case "mock_or_debug":
      return "Mock/Debug: identified by testing patterns in name, email or UID";
    case "incomplete_profile":
      return "Incomplete profile: missing Firestore user document or fiscalProfile";
    case "real_user":
      return "Real user: active profile, valid email and authentic signup";
    default:
      return "Unknown classification";
  }
}

// server/services/diagnosticAi.service.ts
var import_genai = require("@google/genai");

// shared/diagnostics/diagnostic-sanitizer.ts
var maskRfc = (rfc) => {
  if (!rfc) return "S/D";
  const r = rfc.trim().toUpperCase();
  if (r.length < 10) return "****";
  return r.substring(0, 4) + "*".repeat(r.length - 7) + r.substring(r.length - 3);
};
var maskEmail = (email) => {
  if (!email) return "S/D";
  const parts = email.split("@");
  if (parts.length !== 2) return "***";
  const local = parts[0];
  const domain = parts[1];
  const maskedLocal = local.length > 1 ? local[0] + "*".repeat(local.length - 1) : "*";
  const domainParts = domain.split(".");
  const maskedDomain = domainParts.map((dp, i) => {
    if (i === domainParts.length - 1) return dp;
    return dp.length > 1 ? dp[0] + "*".repeat(dp.length - 1) : "*";
  }).join(".");
  return `${maskedLocal}@${maskedDomain}`;
};
var maskName = (name) => {
  if (!name) return "S/D";
  const parts = name.trim().split(/\s+/);
  return parts.map((p) => {
    if (p.length <= 1) return p;
    return p[0] + "*".repeat(p.length - 1);
  }).join(" ");
};
var stripSecrets = (text) => {
  if (!text) return "";
  let clean = text;
  clean = clean.replace(/data:[a-zA-Z\-]+\/[a-zA-Z\-]+;base64,[a-zA-Z0-9\/+=\s\r\n]+/ig, "[BASE64_DATA_REDACTED]");
  clean = clean.replace(/(?:[A-Za-z0-9+/]{4}){25,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/g, "[BASE64_DATA_REDACTED]");
  clean = clean.replace(/<\?xml[\s\S]+?<\/cfdi:Comprobante>/ig, "[XML_DOCUMENT_REDACTED]");
  clean = clean.replace(/<\?xml[\s\S]+?>/ig, "[XML_HEADER_REDACTED]");
  clean = clean.replace(/%PDF-[\s\S]+?%%EOF/ig, "[PDF_DOCUMENT_REDACTED]");
  clean = clean.replace(/https:\/\/[a-zA-Z0-9\-\.\/]+(?:\?|&)(?:GoogleAccessId|Signature|Expires|token|X-Goog-Signature|X-Goog-Algorithm)=[a-zA-Z0-9%_\-\.\+=&]+/ig, "[SIGNED_URL_REDACTED]");
  clean = clean.replace(/bearer\s+[a-zA-Z0-9_\-\.]+/ig, "Bearer [REDACTED]");
  clean = clean.replace(/authorization:\s*[^\r\n]+/ig, "authorization: [REDACTED]");
  clean = clean.replace(/cookie:\s*[^\r\n]+/ig, "cookie: [REDACTED]");
  clean = clean.replace(/(?:key|password|passwd|pwd|secret|token|session_id|sessionId|pass|api_key|apikey)\s*[:=]\s*["']?[a-zA-Z0-9_\-\.\/~\+\=]+["']?/ig, (match) => {
    const parts = match.split(/[:=]/);
    const key = parts[0];
    return `${key.trim()}=[REDACTED]`;
  });
  clean = clean.replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, "[CREDIT_CARD_REDACTED]");
  clean = clean.replace(/\b\d{18}\b/g, "[CLABE_REDACTED]");
  return clean;
};
var sanitizeRunnerDiagnostic = (event) => {
  if (!event) return null;
  const clone = JSON.parse(JSON.stringify(event));
  if (clone.userEmail) {
    clone.userEmailMasked = maskEmail(clone.userEmail);
    delete clone.userEmail;
  }
  if (clone.userDisplayName) {
    clone.userDisplayName = maskName(clone.userDisplayName);
  }
  if (clone.normalizedFields) {
    if (clone.normalizedFields.rfcReceptor) {
      clone.normalizedFields.rfcReceptorMasked = maskRfc(clone.normalizedFields.rfcReceptor);
      delete clone.normalizedFields.rfcReceptor;
    } else if (!clone.normalizedFields.rfcReceptorMasked) {
      clone.normalizedFields.rfcReceptorMasked = "S/D";
    }
    if (clone.normalizedFields.email) {
      clone.normalizedFields.emailMasked = maskEmail(clone.normalizedFields.email);
      delete clone.normalizedFields.email;
    } else if (!clone.normalizedFields.emailMasked) {
      clone.normalizedFields.emailMasked = "S/D";
    }
  }
  if (clone.portalSnapshot) {
    const snap = clone.portalSnapshot;
    if (snap.visibleText) {
      snap.visibleText = snap.visibleText.substring(0, 1e3);
    }
    delete snap.rawHtml;
    delete snap.domTree;
    delete snap.base64Image;
    if (snap.portalMessages) {
      snap.portalMessages = snap.portalMessages.map((msg) => stripSecrets(msg));
    }
  }
  delete clone.xmlContent;
  delete clone.pdfContent;
  delete clone.pdfHtml;
  delete clone.rawResponse;
  delete clone.cookies;
  delete clone.headers;
  delete clone.tokens;
  delete clone.passwords;
  if (clone.technicalMessage) {
    clone.technicalMessage = stripSecrets(clone.technicalMessage);
  }
  if (clone.adminMessage) {
    clone.adminMessage = stripSecrets(clone.adminMessage);
  }
  if (clone.portalMessage) {
    clone.portalMessage = stripSecrets(clone.portalMessage);
  }
  return clone;
};

// shared/diagnostics/diagnostic-ai-prompt.ts
var SYSTEM_AI_PROMPT = `
Eres un analista t\xE9cnico de automatizaci\xF3n de portales de facturaci\xF3n mexicana para ZenTicket.

Tu tarea:
- analizar por qu\xE9 fall\xF3 un ticket;
- identificar la etapa exacta;
- traducir el problema a lenguaje natural;
- proponer soluci\xF3n t\xE9cnica controlada;
- sugerir cambios al conector o recoveryFlow.

Restricciones:
- No marques facturas como v\xE1lidas.
- No inventes XML, PDF, UUID, RFC ni totales.
- No asumas que \u201Cticket ya facturado\u201D significa CFDI v\xE1lido.
- No saltes validaci\xF3n SAT.
- No propongas escribir directamente en Firestore para resolver fiscalmente.
- No propongas crear documentos dummy.
- No propongas hacks espec\xEDficos dentro del core del runner.
- Si se necesita l\xF3gica espec\xEDfica, debe ir como estrategia de conector o regla declarativa revisable.
- Toda propuesta debe quedar en pending_review.

Devuelve \xFAnicamente JSON v\xE1lido con el schema solicitado.
`;

// server/services/diagnosticAi.service.ts
var DiagnosticAiService = class {
  async generateDiagnosticFixProposal(params) {
    if (process.env.GEMINI_DIAGNOSTIC_ENABLED !== "true") {
      throw new Error("GEMINI_DIAGNOSTIC_DISABLED");
    }
    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey || apiKey.length < 20) {
      throw new Error("GEMINI_API_KEY_NOT_CONFIGURED");
    }
    const ai = new import_genai.GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const temperature = parseFloat(process.env.GEMINI_TEMPERATURE || "0.2");
    const maxOutputTokens = parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || "2048", 10);
    const sanitizedParams = sanitizeRunnerDiagnostic(params);
    const userPrompt = `
Analiza la siguiente incidencia de facturaci\xF3n sanitizada y proporciona una propuesta t\xE9cnica detallada en JSON.

DATOS T\xC9CNICOS:
- Ticket ID: ${sanitizedParams.ticketId || ""}
- Connector ID: ${sanitizedParams.connectorId || ""}
- Affected Portal: ${sanitizedParams.affectedPortal || ""}
- Canonical Status: ${sanitizedParams.canonicalStatus || ""}
- Failed Stage: ${sanitizedParams.failedStage || ""}
- Problem Signature: ${sanitizedParams.problemSignature || ""}
- Normalized Fields: ${JSON.stringify(sanitizedParams.normalizedFields || {})}
- Portal Snapshot: ${JSON.stringify(sanitizedParams.portalSnapshot || {})}
- Runner Error Code: ${sanitizedParams.runnerErrorCode || ""}
- Portal Message: ${sanitizedParams.portalMessage || ""}
- Missing Artifacts: ${JSON.stringify(sanitizedParams.missingArtifacts || [])}
- Technical Message: ${sanitizedParams.technicalMessage || ""}
`;
    const responseSchema = {
      type: "OBJECT",
      properties: {
        summary: { type: "STRING" },
        plainLanguageProblem: { type: "STRING" },
        stoppedAtStage: { type: "STRING" },
        likelyCause: { type: "STRING" },
        portalSpecificObservations: { type: "ARRAY", items: { type: "STRING" } },
        suggestedFix: { type: "STRING" },
        recommendedActions: { type: "ARRAY", items: { type: "STRING" } },
        proposedConnectorChanges: {
          type: "OBJECT",
          properties: {
            connectorId: { type: "STRING" },
            type: {
              type: "STRING",
              enum: [
                "field_mapping",
                "recovery_flow",
                "selector_update",
                "captcha_flow",
                "download_detection",
                "error_classifier",
                "jit_learning_rule"
              ]
            },
            description: { type: "STRING" },
            riskLevel: { type: "STRING", enum: ["low", "medium", "high"] },
            filesLikelyAffected: { type: "ARRAY", items: { type: "STRING" } },
            pseudoPatch: { type: "STRING" },
            testPlan: { type: "ARRAY", items: { type: "STRING" } }
          },
          required: ["connectorId", "type", "description", "riskLevel", "filesLikelyAffected", "testPlan"]
        },
        recoveryFlowProposal: {
          type: "OBJECT",
          properties: {
            steps: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  action: {
                    type: "STRING",
                    enum: ["click", "fill", "waitForText", "download", "navigate", "extract", "validate"]
                  },
                  target: { type: "STRING" },
                  value: { type: "STRING" },
                  expectedResult: { type: "STRING" }
                },
                required: ["action", "target", "expectedResult"]
              }
            }
          },
          required: ["steps"]
        },
        confidence: { type: "NUMBER" },
        requiresHumanReview: { type: "BOOLEAN" },
        forbiddenActionsDetected: { type: "ARRAY", items: { type: "STRING" } }
      },
      required: [
        "summary",
        "plainLanguageProblem",
        "stoppedAtStage",
        "likelyCause",
        "portalSpecificObservations",
        "suggestedFix",
        "recommendedActions",
        "proposedConnectorChanges",
        "confidence",
        "requiresHumanReview",
        "forbiddenActionsDetected"
      ]
    };
    const response = await ai.models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_AI_PROMPT,
        temperature,
        maxOutputTokens,
        responseMimeType: "application/json",
        responseSchema
      }
    });
    const responseText = response.text;
    if (!responseText) {
      throw new Error("EMPTY_GEMINI_RESPONSE");
    }
    try {
      const parsed = JSON.parse(responseText);
      return parsed;
    } catch (e) {
      console.error("Failed to parse Gemini response text:", responseText);
      throw new Error("INVALID_JSON_RESPONSE");
    }
  }
};
var diagnosticAiService = new DiagnosticAiService();

// server/services/connectorLearning.service.ts
var import_app2 = require("firebase-admin/app");
var import_firestore2 = require("firebase-admin/firestore");
var ConnectorLearningService = class {
  getDbSafe() {
    if ((0, import_app2.getApps)().length === 0) throw new Error("Firebase not initialized");
    return (0, import_firestore2.getFirestore)((0, import_app2.getApps)()[0], "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee");
  }
  async createPatchProposal(proposalData) {
    const db = this.getDbSafe();
    const proposal = await db.runTransaction(async (transaction) => {
      const query = db.collection("connector_patch_proposals").where("ticketId", "==", proposalData.ticketId).where("status", "==", "pending_review");
      const proposalsSnap = await transaction.get(query);
      proposalsSnap.docs.forEach((doc) => {
        transaction.update(doc.ref, {
          status: "superseded",
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          supersededAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      });
      const docRef = db.collection("connector_patch_proposals").doc();
      const newProposal = {
        proposalId: docRef.id,
        status: "pending_review",
        createdBy: "gemini",
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
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
  async listPatchProposals(filters = {}) {
    const db = this.getDbSafe();
    let query = db.collection("connector_patch_proposals");
    if (filters.connectorId) {
      query = query.where("connectorId", "==", filters.connectorId);
    }
    if (filters.status) {
      query = query.where("status", "==", filters.status);
    }
    const snap = await query.get();
    return snap.docs.map((d) => d.data());
  }
  async transitionProposalStatus(proposalId, targetStatus, adminUser, extraFields = {}) {
    const db = this.getDbSafe();
    const docRef = db.collection("connector_patch_proposals").doc(proposalId);
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists) {
        throw new Error("PROPOSAL_NOT_FOUND");
      }
      const proposal = snap.data();
      const currentStatus = proposal.status;
      if (currentStatus === targetStatus) {
        return;
      }
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
      const adminEmail = adminUser?.email || adminUser?.uid || adminUser?.userId || "admin@zenticket.com";
      const timestamp = (/* @__PURE__ */ new Date()).toISOString();
      transaction.update(docRef, {
        status: targetStatus,
        reviewedBy: adminEmail,
        reviewedAt: timestamp,
        updatedAt: timestamp,
        ...extraFields
      });
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
  async approveForSandbox(proposalId, adminUser) {
    await this.transitionProposalStatus(proposalId, "approved_for_sandbox", adminUser);
  }
  async rejectProposal(proposalId, adminUser) {
    await this.transitionProposalStatus(proposalId, "rejected", adminUser);
  }
  async requestRevision(proposalId, comment, adminUser) {
    await this.transitionProposalStatus(proposalId, "revision_requested", adminUser, { comment });
  }
  async promoteToObservation(proposalId, adminUser) {
    await this.transitionProposalStatus(proposalId, "approved_for_observation", adminUser);
  }
  async promoteToActive(proposalId, adminUser) {
    await this.transitionProposalStatus(proposalId, "active", adminUser, { appliedAt: (/* @__PURE__ */ new Date()).toISOString() });
  }
};
var connectorLearningService = new ConnectorLearningService();

// server/services/aiBudget.service.ts
var import_app3 = require("firebase-admin/app");
var import_firestore3 = require("firebase-admin/firestore");
var AiBudgetService = class {
  getDbSafe() {
    if ((0, import_app3.getApps)().length === 0) throw new Error("Firebase not initialized");
    return (0, import_firestore3.getFirestore)((0, import_app3.getApps)()[0], "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee");
  }
  // 1. Cache only check (no counters modified)
  async checkCacheOnly(sanitizedInputHash) {
    const db = this.getDbSafe();
    const cacheSnap = await db.collection("connector_patch_proposals").where("sanitizedInputHash", "==", sanitizedInputHash).where("status", "==", "pending_review").limit(1).get();
    if (!cacheSnap.empty) {
      console.log(`[AiBudget] Cache hit for sanitizedInputHash: ${sanitizedInputHash}`);
      return cacheSnap.docs[0].data();
    }
    return null;
  }
  // 2. Transactional quota reservation (increments counters)
  async reserveQuota(ticketId) {
    const db = this.getDbSafe();
    const dailyLimit = parseInt(process.env.GEMINI_DAILY_BUDGET_LIMIT || "100", 10);
    const monthlyLimit = parseInt(process.env.GEMINI_MONTHLY_BUDGET_LIMIT || "1000", 10);
    const now = /* @__PURE__ */ new Date();
    const dailyKey = "daily_" + now.toISOString().split("T")[0];
    const monthlyKey = "monthly_" + now.toISOString().substring(0, 7);
    const ticketKey = "ticket_" + ticketId;
    const dailyDocRef = db.collection("ai_budget_counters").doc(dailyKey);
    const monthlyDocRef = db.collection("ai_budget_counters").doc(monthlyKey);
    const ticketDocRef = db.collection("ai_budget_counters").doc(ticketKey);
    await db.runTransaction(async (transaction) => {
      const dailySnap = await transaction.get(dailyDocRef);
      const monthlySnap = await transaction.get(monthlyDocRef);
      const ticketSnap = await transaction.get(ticketDocRef);
      const dailyCount = dailySnap.exists ? dailySnap.data()?.count || 0 : 0;
      const monthlyCount = monthlySnap.exists ? monthlySnap.data()?.count || 0 : 0;
      const ticketCount = ticketSnap.exists ? ticketSnap.data()?.count || 0 : 0;
      if (dailyCount >= dailyLimit) {
        throw new Error("DAILY_BUDGET_EXCEEDED");
      }
      if (monthlyCount >= monthlyLimit) {
        throw new Error("MONTHLY_BUDGET_EXCEEDED");
      }
      if (ticketCount >= 10) {
        throw new Error("TICKET_BUDGET_EXCEEDED");
      }
      transaction.set(dailyDocRef, { count: dailyCount + 1 }, { merge: true });
      transaction.set(monthlyDocRef, { count: monthlyCount + 1 }, { merge: true });
      transaction.set(ticketDocRef, { count: ticketCount + 1 }, { merge: true });
    });
    return { dailyKey, monthlyKey, ticketKey };
  }
  // 3. Transactional quota release (decrements counters in case of failure)
  async releaseQuota(keys) {
    const db = this.getDbSafe();
    const dailyDocRef = db.collection("ai_budget_counters").doc(keys.dailyKey);
    const monthlyDocRef = db.collection("ai_budget_counters").doc(keys.monthlyKey);
    const ticketDocRef = db.collection("ai_budget_counters").doc(keys.ticketKey);
    await db.runTransaction(async (transaction) => {
      const dailySnap = await transaction.get(dailyDocRef);
      const monthlySnap = await transaction.get(monthlyDocRef);
      const ticketSnap = await transaction.get(ticketDocRef);
      const dailyCount = dailySnap.exists ? dailySnap.data()?.count || 0 : 0;
      const monthlyCount = monthlySnap.exists ? monthlySnap.data()?.count || 0 : 0;
      const ticketCount = ticketSnap.exists ? ticketSnap.data()?.count || 0 : 0;
      transaction.set(dailyDocRef, { count: Math.max(0, dailyCount - 1) }, { merge: true });
      transaction.set(monthlyDocRef, { count: Math.max(0, monthlyCount - 1) }, { merge: true });
      transaction.set(ticketDocRef, { count: Math.max(0, ticketCount - 1) }, { merge: true });
    });
  }
  async logUsage(logData) {
    const db = this.getDbSafe();
    const docRef = db.collection("ai_usage_logs").doc();
    await docRef.set({
      requestId: docRef.id,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      ...logData
    });
  }
};
var aiBudgetService = new AiBudgetService();

// server/schemas/connectorPatchProposal.schema.ts
var import_zod = require("zod");
var proposedConnectorChangesSchema = import_zod.z.object({
  connectorId: import_zod.z.string(),
  type: import_zod.z.enum([
    "field_mapping",
    "recovery_flow",
    "selector_update",
    "captcha_flow",
    "download_detection",
    "error_classifier",
    "jit_learning_rule"
  ]),
  description: import_zod.z.string(),
  riskLevel: import_zod.z.enum(["low", "medium", "high"]),
  filesLikelyAffected: import_zod.z.array(import_zod.z.string()),
  pseudoPatch: import_zod.z.string().optional(),
  testPlan: import_zod.z.array(import_zod.z.string())
});
var recoveryFlowStepSchema = import_zod.z.object({
  action: import_zod.z.enum(["click", "fill", "waitForText", "download", "navigate", "extract", "validate"]),
  target: import_zod.z.string(),
  value: import_zod.z.string().optional(),
  expectedResult: import_zod.z.string()
});
var recoveryFlowProposalSchema = import_zod.z.object({
  steps: import_zod.z.array(recoveryFlowStepSchema)
});
var connectorPatchProposalSchema = import_zod.z.object({
  summary: import_zod.z.string(),
  plainLanguageProblem: import_zod.z.string(),
  stoppedAtStage: import_zod.z.string(),
  likelyCause: import_zod.z.string(),
  portalSpecificObservations: import_zod.z.array(import_zod.z.string()),
  suggestedFix: import_zod.z.string(),
  recommendedActions: import_zod.z.array(import_zod.z.string()),
  proposedConnectorChanges: proposedConnectorChangesSchema,
  recoveryFlowProposal: recoveryFlowProposalSchema.optional(),
  confidence: import_zod.z.number().min(0).max(1),
  requiresHumanReview: import_zod.z.literal(true),
  forbiddenActionsDetected: import_zod.z.array(import_zod.z.string())
});

// server/services/adminDiagnostics.service.ts
var import_crypto = __toESM(require("crypto"), 1);
var import_storage = require("firebase-admin/storage");
var AdminDiagnosticsService = class {
  async listDiagnostics(filters) {
    const view = filters.view || "by_user";
    const authUsers = await diagnosticsRepository.getAllAuthUsers();
    const firestoreUsers = await diagnosticsRepository.getAllUsers();
    const fiscalProfiles = await diagnosticsRepository.getAllFiscalProfiles();
    const allTickets = await diagnosticsRepository.getAllTickets();
    const allJobs = await diagnosticsRepository.getAllJobs();
    const allInvoices = await diagnosticsRepository.getAllInvoices();
    const allConnectors = await diagnosticsRepository.getAllConnectors();
    const maskEmail2 = (email) => {
      if (!email) return "S/D";
      const parts = email.split("@");
      if (parts.length !== 2) return email;
      const [local, domain] = parts;
      if (local.length <= 2) return `${local[0]}***@${domain}`;
      return `${local[0]}***${local[local.length - 1]}@${domain}`;
    };
    const allUserIds = /* @__PURE__ */ new Set();
    authUsers.forEach((u) => allUserIds.add(u.uid));
    firestoreUsers.forEach((u) => allUserIds.add(u.id));
    fiscalProfiles.forEach((u) => allUserIds.add(u.id));
    const processedUsers = Array.from(allUserIds).map((userId) => {
      const authUser = authUsers.find((u) => u.uid === userId);
      const userDoc = firestoreUsers.find((u) => u.id === userId);
      const fiscalProfile = fiscalProfiles.find((u) => u.id === userId);
      const displayName = userDoc?.displayName || userDoc?.name || authUser?.displayName || "Usuario " + userId.slice(0, 5);
      const email = authUser?.email || userDoc?.email || fiscalProfile?.email || "";
      const emailMasked = maskEmail2(email);
      const emailHashOrPartial = email ? email.split("@")[0].slice(0, 3) + "..." : "S/D";
      const userTickets = allTickets.filter((t) => t.userId === userId);
      const userInvoices = allInvoices.filter((i) => i.userId === userId);
      const userJobs = allJobs.filter((j) => j.userId === userId);
      const userView = buildUserTicketsView({
        tickets: userTickets,
        invoices: userInvoices,
        jobs: userJobs,
        userId,
        userDisplayName: displayName,
        userEmailMasked: emailMasked,
        connectors: allConnectors
      });
      const activeItems = userView.items.filter((item) => item.bucket !== "archived" && item.canonicalStatus !== "archived");
      const activeCounts = {
        totalVisible: activeItems.length,
        inProcess: activeItems.filter((x) => x.bucket === "in_process").length,
        ready: activeItems.filter((x) => x.bucket === "ready").length,
        attention: activeItems.filter((x) => x.bucket === "attention").length,
        failed: activeItems.filter((x) => x.bucket === "failed").length,
        correctionRequired: activeItems.filter((x) => x.bucket === "correction_required").length
      };
      const userViewFiltered = {
        ...userView,
        items: activeItems,
        counts: activeCounts
      };
      let latestActivityAt = null;
      if (userViewFiltered.items.length > 0) {
        const dates = userViewFiltered.items.map((item) => item.date).filter((d) => !!d).map((d) => new Date(d).getTime());
        if (dates.length > 0) {
          latestActivityAt = new Date(Math.max(...dates)).toISOString();
        }
      }
      const source = {
        auth: !!authUser,
        firestoreProfile: !!userDoc,
        fiscalProfile: !!fiscalProfile,
        tickets: userTickets.length > 0
      };
      const userVisibilityStatus = classifyAdminUser({
        userId,
        userDisplayName: displayName,
        email,
        source
      });
      const userVisibilityReason = getUserVisibilityReason({
        userId,
        userDisplayName: displayName,
        email,
        source
      });
      const isProtected = userVisibilityStatus === "protected_user";
      let isRecentSignupProtected = false;
      if (authUser?.metadata?.creationTime) {
        const creationDate = new Date(authUser.metadata.creationTime);
        const NOW_MS = (/* @__PURE__ */ new Date("2026-07-09T23:15:28Z")).getTime();
        if (NOW_MS - creationDate.getTime() <= 48 * 60 * 60 * 1e3) {
          isRecentSignupProtected = true;
        }
      }
      const deletionCandidate = (userVisibilityStatus === "incomplete_profile" || userVisibilityStatus === "mock_or_debug") && !isProtected && !isRecentSignupProtected && userTickets.length === 0 && userInvoices.length === 0 && userJobs.length === 0;
      let userStatus = "without_tickets";
      const counts = userViewFiltered.counts;
      if (counts.failed > 0 || counts.correctionRequired > 0 || counts.attention > 0) {
        userStatus = "with_issues";
      } else if (counts.totalVisible > 0) {
        if (counts.ready === counts.totalVisible) {
          userStatus = "ready_only";
        } else {
          userStatus = "with_activity";
        }
      } else if (!userDoc || !fiscalProfile) {
        userStatus = "incomplete_profile";
      }
      return {
        ...userViewFiltered,
        userStatus,
        source,
        emailHashOrPartial,
        latestActivityAt,
        metadata: authUser?.metadata || null,
        email,
        userVisibilityStatus,
        userVisibilityReason,
        deletionCandidate,
        protectedUser: isProtected
      };
    });
    let filteredUsers = processedUsers.map((u) => {
      let items = u.items;
      if (filters.ticketReference) {
        items = items.filter((item) => item.ticketReference === filters.ticketReference);
      }
      if (filters.ticketId) {
        items = items.filter((item) => item.ticketId === filters.ticketId);
      }
      if (filters.connectorId) {
        items = items.filter((item) => item.connectorId === filters.connectorId);
      }
      if (filters.portalName) {
        items = items.filter((item) => item.portal.toLowerCase().includes(filters.portalName.toLowerCase()));
      }
      if (filters.canonicalStatus) {
        items = items.filter((item) => item.canonicalStatus === filters.canonicalStatus);
      }
      if (filters.bucket) {
        items = items.filter((item) => item.bucket === filters.bucket);
      }
      if (filters.dateFrom) {
        const fromTime = new Date(filters.dateFrom).getTime();
        items = items.filter((item) => item.date && new Date(item.date).getTime() >= fromTime);
      }
      if (filters.dateTo) {
        const toTime = new Date(filters.dateTo).getTime();
        items = items.filter((item) => item.date && new Date(item.date).getTime() <= toTime);
      }
      const counts = {
        totalVisible: items.length,
        inProcess: items.filter((x) => x.bucket === "in_process").length,
        ready: items.filter((x) => x.bucket === "ready").length,
        attention: items.filter((x) => x.bucket === "attention").length,
        failed: items.filter((x) => x.bucket === "failed").length,
        correctionRequired: items.filter((x) => x.bucket === "correction_required").length
      };
      return {
        ...u,
        items,
        counts
      };
    });
    if (filters.userId) {
      filteredUsers = filteredUsers.filter((u) => u.userId === filters.userId);
    }
    if (filters.userEmail) {
      filteredUsers = filteredUsers.filter((u) => u.userEmailMasked.toLowerCase().includes(filters.userEmail.toLowerCase()));
    }
    const userVisibility = filters.userVisibility || "real";
    if (userVisibility === "real") {
      filteredUsers = filteredUsers.filter((u) => u.userVisibilityStatus === "real_user" || u.userVisibilityStatus === "protected_user");
    } else if (userVisibility === "incomplete") {
      filteredUsers = filteredUsers.filter((u) => u.userVisibilityStatus === "incomplete_profile");
    } else if (userVisibility === "mock") {
      filteredUsers = filteredUsers.filter((u) => u.userVisibilityStatus === "mock_or_debug" || u.userVisibilityStatus === "orphan_activity");
    }
    const hasTicketFilter = !!(filters.ticketReference || filters.ticketId || filters.connectorId || filters.portalName || filters.canonicalStatus || filters.bucket || filters.dateFrom || filters.dateTo);
    if (hasTicketFilter || view !== "by_user") {
      filteredUsers = filteredUsers.filter((u) => u.items.length > 0);
    }
    filteredUsers.forEach((u) => {
      u.items.sort((a, b) => {
        const scoreA = getItemSortScore(a);
        const scoreB = getItemSortScore(b);
        if (scoreA !== scoreB) return scoreB - scoreA;
        const timeA = a.date ? new Date(a.date).getTime() : 0;
        const timeB = b.date ? new Date(b.date).getTime() : 0;
        return timeB - timeA;
      });
    });
    function getItemSortScore(item) {
      switch (item.bucket) {
        case "attention":
          return 6;
        case "failed":
          return 5;
        case "in_process":
          return 4;
        case "correction_required":
          return 3;
        case "ready":
          return 2;
        default:
          return 1;
      }
    }
    let totalUsers = filteredUsers.length;
    let usersWithIssues = 0;
    let usersWithTickets = 0;
    let usersWithoutTickets = 0;
    let usersIncompleteProfile = 0;
    let inProcessTickets = 0;
    let attentionTickets = 0;
    let failedTickets = 0;
    let readyTickets = 0;
    let pendingRetries = 0;
    let last24h = 0;
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1e3);
    filteredUsers.forEach((u) => {
      if (u.userStatus === "with_issues") {
        usersWithIssues++;
      }
      if (u.userStatus === "incomplete_profile") {
        usersIncompleteProfile++;
      }
      if (u.counts.totalVisible > 0) {
        usersWithTickets++;
      } else {
        usersWithoutTickets++;
      }
      inProcessTickets += u.counts.inProcess;
      attentionTickets += u.counts.attention;
      failedTickets += u.counts.failed + u.counts.correctionRequired;
      readyTickets += u.counts.ready;
      u.items.forEach((item) => {
        if (["invoice_recovery_pending", "invoice_recovery_retrying", "automation_failed"].includes(item.canonicalStatus)) {
          pendingRetries++;
        }
        if (item.bucket !== "ready" && item.bucket !== "archived" && item.date) {
          const itemDate = new Date(item.date);
          if (itemDate >= twentyFourHoursAgo) {
            last24h++;
          }
        }
      });
    });
    const metrics = {
      totalUsers,
      usersWithIssues,
      usersWithTickets,
      usersWithoutTickets,
      usersIncompleteProfile,
      inProcessTickets,
      attentionTickets,
      failedTickets,
      readyTickets,
      pendingRetries,
      last24h
    };
    const limit = filters.limit || 20;
    if (view === "by_user") {
      let getUserSortScore = function(u) {
        let statusScore = 0;
        switch (u.userStatus) {
          case "with_issues":
            statusScore = 1e13;
            break;
          case "with_activity":
            statusScore = 8e12;
            break;
          case "ready_only":
            statusScore = 6e12;
            break;
          case "incomplete_profile":
            statusScore = 4e12;
            break;
          case "without_tickets":
            statusScore = 2e12;
            break;
          default:
            statusScore = 0;
        }
        const activityTime = u.latestActivityAt ? new Date(u.latestActivityAt).getTime() : 0;
        return statusScore + activityTime;
      };
      filteredUsers.sort((a, b) => {
        const scoreA = getUserSortScore(a);
        const scoreB = getUserSortScore(b);
        return scoreB - scoreA;
      });
      let paginatedUsers = [];
      if (filters.cursor) {
        const idx = filteredUsers.findIndex((u) => u.userId === filters.cursor);
        if (idx !== -1) {
          paginatedUsers = filteredUsers.slice(idx + 1, idx + 1 + limit);
        } else {
          paginatedUsers = filteredUsers.slice(0, limit);
        }
      } else {
        paginatedUsers = filteredUsers.slice(0, limit);
      }
      const nextCursor = paginatedUsers.length === limit ? paginatedUsers[paginatedUsers.length - 1].userId : null;
      return {
        users: paginatedUsers,
        items: [],
        metrics,
        nextCursor
      };
    } else {
      const flatItems = [];
      filteredUsers.forEach((u) => {
        u.items.forEach((item) => {
          let keep = false;
          if (view === "all") {
            keep = true;
          } else if (view === "in_process" && item.bucket === "in_process") {
            keep = true;
          } else if (view === "attention" && item.bucket === "attention") {
            keep = true;
          } else if (view === "failed" && (item.bucket === "failed" || item.bucket === "correction_required")) {
            keep = true;
          } else if (view === "ready" && item.bucket === "ready") {
            keep = true;
          } else if (view === "archived" && item.bucket === "archived") {
            keep = true;
          }
          if (keep) {
            flatItems.push({
              ...item,
              userId: u.userId,
              userDisplayName: u.userDisplayName,
              userEmailMasked: u.userEmailMasked
            });
          }
        });
      });
      flatItems.sort((a, b) => {
        const timeA = a.date ? new Date(a.date).getTime() : 0;
        const timeB = b.date ? new Date(b.date).getTime() : 0;
        return timeB - timeA;
      });
      let paginatedItems = [];
      if (filters.cursor) {
        const idx = flatItems.findIndex((x) => x.visualKey === filters.cursor);
        if (idx !== -1) {
          paginatedItems = flatItems.slice(idx + 1, idx + 1 + limit);
        } else {
          paginatedItems = flatItems.slice(0, limit);
        }
      } else {
        paginatedItems = flatItems.slice(0, limit);
      }
      const nextCursor = paginatedItems.length === limit ? paginatedItems[paginatedItems.length - 1].visualKey : null;
      return {
        users: [],
        items: paginatedItems,
        metrics,
        nextCursor
      };
    }
  }
  buildIncidentEvidence(ticket, job, timeline) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const makeVal = (value, source, capturedAt = null, confidence = "high") => {
      if (value === void 0 || value === null || String(value).trim() === "" || String(value).toLowerCase() === "unknown") {
        return null;
      }
      return {
        value: String(value),
        source,
        capturedAt: capturedAt || (ticket?.createdAt || now),
        confidence
      };
    };
    const failureStage = makeVal(
      ticket?.failedStage || job?.lastFailedStage,
      "runner_event",
      ticket?.updatedAt || job?.updatedAt
    );
    let lastCompleted = null;
    let lastCompletedAt = null;
    if (timeline && timeline.length > 0) {
      for (let i = timeline.length - 1; i >= 0; i--) {
        const ev = timeline[i];
        if (ev.status === "success" && ev.stage !== "failed_blocking") {
          lastCompleted = ev.stage;
          lastCompletedAt = ev.createdAt;
          break;
        }
      }
    }
    const lastCompletedAction = makeVal(lastCompleted, "runner_event", lastCompletedAt);
    let attempted = null;
    let attemptedAt = null;
    if (timeline && timeline.length > 0) {
      const failedEvent = timeline.find((ev) => ev.status === "failed");
      if (failedEvent) {
        attempted = failedEvent.stage;
        attemptedAt = failedEvent.createdAt;
      }
    }
    if (!attempted) {
      attempted = ticket?.failedStage || job?.lastFailedStage || null;
    }
    const attemptedAction = makeVal(attempted, "runner_event", attemptedAt || ticket?.updatedAt);
    const techErrorMsg = job?.lastError || ticket?.errorMsg || null;
    let expected = null;
    if (techErrorMsg) {
      const match = techErrorMsg.match(/waiting for selector\s+["']([^"']+)["']/i) || techErrorMsg.match(/selector\s+["']([^"']+)["']\s+to be/i);
      if (match) {
        expected = `Elemento selector: ${match[1]}`;
      } else if (techErrorMsg.toLowerCase().includes("timeout")) {
        expected = "Elemento selector en pantalla del portal";
      }
    }
    const expectedCondition = makeVal(expected, "playwright_error", ticket?.updatedAt);
    const portalMessages = job?.portalSnapshot?.portalMessages || [];
    let observed = null;
    let observedSource = "playwright_error";
    if (portalMessages.length > 0) {
      observed = portalMessages.join("\n");
      observedSource = "portal_dom";
    } else if (techErrorMsg) {
      observed = techErrorMsg;
    }
    const observedCondition = makeVal(observed, observedSource, ticket?.updatedAt);
    let screenshot = null;
    const sPath = job?.evidenceScreenshotPath || job?.portalSnapshot?.screenshotPath || timeline && timeline.find((t) => t.screenshotPath)?.screenshotPath;
    if (sPath) {
      screenshot = {
        storagePath: sPath,
        capturedAt: job?.updatedAt || ticket?.updatedAt || now,
        source: "runner"
      };
    }
    const timelineEvents = (timeline || []).map((ev) => ({
      id: ev.id || "",
      stage: ev.stage || "unknown",
      status: ev.status || "started",
      createdAt: ev.createdAt || now,
      technicalMessage: ev.technicalMessage || null
    }));
    const visibleDomText = job?.portalSnapshot?.visibleText || null;
    const technicalError = techErrorMsg || null;
    return {
      failureStage,
      lastCompletedAction,
      attemptedAction,
      expectedCondition,
      observedCondition,
      screenshot,
      timeline: timelineEvents,
      portalMessages,
      visibleDomText,
      technicalError,
      connectorId: ticket?.connectorId || job?.connectorId || null,
      connectorVersion: ticket?.connectorVersion || job?.connectorVersion || null,
      jitVersion: ticket?.jitVersion || job?.jitVersion || null,
      attemptNumber: job?.attempts || 1
    };
  }
  async getDiagnosticDetail(ticketId) {
    let ticket = await diagnosticsRepository.getTicket(ticketId);
    let invoice = null;
    let userId = null;
    if (!ticket) {
      const allInvoices = await diagnosticsRepository.getAllInvoices();
      invoice = allInvoices.find((i) => i.id === ticketId || i.ticketId === ticketId || i.sourceTicketId === ticketId);
      if (invoice) {
        userId = invoice.userId;
      }
    } else {
      userId = ticket.userId;
      if (ticket.invoiceId) {
        invoice = await diagnosticsRepository.getInvoice(ticket.userId, ticket.invoiceId);
      }
    }
    if (!ticket && !invoice) return null;
    const allTickets = await diagnosticsRepository.getAllTickets();
    const userTickets = allTickets.filter(
      (t) => t.userId === userId && t.status !== "deleted" && !t.deletedAt
    );
    const targetDoc = ticket || { id: ticketId, userId, ...invoice };
    const siblings = userTickets.filter((t) => isSiblingTicket(t, targetDoc) || t.id === targetDoc.id);
    let canonicalTicket = siblings.find((t) => t.canonicalTicketId && t.canonicalTicketId === t.id);
    if (!canonicalTicket) {
      const allJobs2 = await diagnosticsRepository.getAllJobs();
      canonicalTicket = siblings.find((t) => allJobs2.some((j) => j.ticketId === t.id));
    }
    if (!canonicalTicket) {
      canonicalTicket = [...siblings].sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeA - timeB;
      })[0] || targetDoc;
    }
    const canonicalTicketId = canonicalTicket.id;
    const memberTicketIds = siblings.map((t) => t.id);
    const allJobs = await diagnosticsRepository.getAllJobs();
    const activeJob = selectDiagnosticAttempt({
      canonicalTicketId,
      memberTicketIds,
      jobs: allJobs
    });
    let timeline = [];
    if (activeJob) {
      timeline = activeJob.portalSnapshot?.timeline || activeJob.timeline || await diagnosticsRepository.getTimeline(activeJob.ticketId) || [];
    }
    if (timeline.length === 0) {
      timeline = await diagnosticsRepository.getTimeline(canonicalTicketId) || [];
    }
    const getLastCompletedAction = (events) => {
      if (!events || events.length === 0) return null;
      for (let i = events.length - 1; i >= 0; i--) {
        const ev = events[i];
        if (ev.status === "success" && ev.stage !== "failed_blocking") {
          return ev.stage;
        }
      }
      return null;
    };
    const getAttemptedAction = (events) => {
      if (!events || events.length === 0) return null;
      const failedEvent = events.find((ev) => ev.status === "failed");
      if (failedEvent) return failedEvent.stage;
      return null;
    };
    const getExpectedFinding = (technicalMessage) => {
      if (!technicalMessage) return null;
      const match = technicalMessage.match(/waiting for selector\s+["']([^"']+)["']/i) || technicalMessage.match(/selector\s+["']([^"']+)["']\s+to be/i);
      if (match) {
        return `Elemento selector: ${match[1]}`;
      }
      if (technicalMessage.toLowerCase().includes("timeout")) {
        return "Elemento selector en pantalla del portal";
      }
      return null;
    };
    const getActualFinding = (portalMessage, errorMsg) => {
      if (portalMessage && portalMessage.trim().length > 0) {
        return portalMessage;
      }
      if (errorMsg) {
        if (errorMsg.includes("Timeout")) return "L\xEDmite de tiempo agotado (Timeout) sin respuesta del elemento.";
        return errorMsg;
      }
      return null;
    };
    const getBlockCause = (problemSignature, errorMsg) => {
      if (problemSignature && problemSignature !== "unknown") {
        return problemSignature;
      }
      if (errorMsg) {
        const lowerMsg = errorMsg.toLowerCase();
        if (lowerMsg.includes("captcha")) return "Se requiere resoluci\xF3n manual de CAPTCHA.";
        if (lowerMsg.includes("session") || lowerMsg.includes("expirada")) return "Sesi\xF3n del portal expirada.";
        if (lowerMsg.includes("selector") || lowerMsg.includes("timeout")) return "Cambio en la estructura del portal (selector no encontrado).";
      }
      return "Situaci\xF3n de bloqueo no clasificada previamente.";
    };
    const techCause = activeJob?.lastError || canonicalTicket?.errorMsg || null;
    const portalMsg = canonicalTicket?.portalMessage || activeJob?.portalSnapshot?.portalMessages && activeJob.portalSnapshot.portalMessages.join("\n") || null;
    const probSignature = canonicalTicket?.problemSignature || canonicalTicket?.reviewReasonCode || activeJob?.lastErrorCode || "unknown";
    const lastActionCompleted = getLastCompletedAction(timeline);
    const attemptedAction = getAttemptedAction(timeline) || canonicalTicket?.failedStage || activeJob?.lastFailedStage || null;
    const expectedFinding = getExpectedFinding(techCause);
    const actualFinding = getActualFinding(portalMsg, techCause);
    const blockCause = getBlockCause(probSignature, techCause);
    const canonicalState = getBillingCanonicalState({ ticket: canonicalTicket, job: activeJob, invoice });
    const user = userId ? await diagnosticsRepository.getUser(userId) : null;
    const isLegacy = invoice ? invoice._path ? invoice._path.split("/").length === 2 : false : false;
    const isDuplicate = canonicalTicketId !== ticketId;
    const siblingTicketId = isDuplicate ? canonicalTicketId : null;
    const summary = {
      id: ticketId,
      ticketId,
      ticketReference: canonicalTicket?.folio || canonicalTicket?.portalFields?.billingReference || invoice?.ticketReference || "S/D",
      userId: userId || invoice?.userId,
      affectedPortal: canonicalTicket?.nombreEmisor || invoice?.nombreEmisor || "OXXO CADENA",
      connectorId: canonicalTicket?.connectorId || invoice?.connectorId || resolveConnectorId(canonicalTicket?.nombreEmisor || invoice?.nombreEmisor || ""),
      canonicalStatus: canonicalState.canonicalStatus,
      plainLanguageProblem: canonicalState.message,
      technicalCause: techCause || "Sin error t\xE9cnico",
      suggestedAction: canonicalState.message,
      severity: canonicalState.badgeTone === "bg-red-500" ? "critical" : "error",
      retryable: ["invoice_recovery_pending", "invoice_recovery_retrying", "automation_failed"].includes(canonicalState.canonicalStatus),
      createdAt: ticket?.createdAt || invoice?.createdAt || null,
      updatedAt: ticket?.updatedAt || invoice?.updatedAt || null,
      bucket: canonicalState.shouldAppearInReady && canonicalState.isValidInvoice ? "ready" : "in_process",
      failedStage: canonicalTicket?.failedStage || activeJob?.lastFailedStage || "unknown",
      problemSignature: probSignature,
      invoiceId: invoice?.id || null,
      uuid: invoice?.uuid || invoice?.folioFiscal || null,
      satStatus: invoice?.satStatus || invoice?.estadoCfdi || "S/D",
      validationStatus: invoice?.validationStatus || "S/D",
      total: canonicalState.displayTotal,
      validationDate: invoice?.updatedAt || invoice?.createdAt || null,
      hasXml: !!(invoice?.xmlContent && invoice.xmlContent.trim().length > 0 || invoice?.xmlStoragePath && invoice.xmlStoragePath.trim().length > 0),
      hasPdf: !!(invoice?.pdfHtml && invoice.pdfHtml.trim().length > 0 || invoice?.pdfStoragePath && invoice.pdfStoragePath.trim().length > 0),
      legacyRootInvoice: isLegacy,
      linkedTicketDeleted: invoice ? invoice.linkedTicketDeleted === true : false,
      lastActionCompleted,
      attemptedAction,
      expectedFinding,
      actualFinding,
      blockCause,
      isDuplicate,
      siblingTicketId
    };
    const finalTimeline = timeline.length > 0 ? timeline : [
      {
        id: "created",
        ticketId,
        createdAt: ticket?.createdAt || invoice?.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
        type: "info",
        message: "Ticket creado en sistema",
        stage: "created"
      }
    ];
    const rawDateCandidates = {
      portalFieldsFecha: canonicalTicket?.portalFields?.fecha || null,
      purchaseDate: canonicalTicket?.purchaseDate || null,
      ticketDate: canonicalTicket?.fechaCompra || null,
      createdAt: canonicalTicket?.createdAt || null
    };
    const normalizedFields = {
      folio: canonicalTicket?.portalFields?.billingReference || canonicalTicket?.reference || null,
      itu: canonicalTicket?.portalFields?.itu || null,
      total: canonicalTicket?.expectedTicketTotal || null,
      fechaCompra: canonicalTicket?.fechaCompra || null,
      fechaCompraSource: canonicalTicket?.fechaCompra ? "ticket.fechaCompra" : "unknown",
      rawDateCandidates,
      rfcReceptorMasked: "S/D",
      emailMasked: "S/D"
    };
    const rawEvidence = this.buildIncidentEvidence(canonicalTicket, activeJob, finalTimeline);
    const evidence = {
      ...rawEvidence,
      screenshotReason: rawEvidence.screenshot ? "OK" : activeJob ? "screenshot_not_captured" : "runner_job_not_found",
      timelineReason: rawEvidence.timeline && rawEvidence.timeline.length > 1 ? "OK" : activeJob ? "runner_events_not_persisted" : "runner_job_not_found",
      technicalCauseReason: rawEvidence.observedCondition ? "OK" : activeJob ? "runner_events_not_persisted" : "runner_job_not_found",
      connectorReason: canonicalTicket?.connectorId || activeJob?.connectorId ? "OK" : "connector_relation_missing",
      provenance: {
        ticketId: canonicalTicketId,
        jobId: activeJob?.id || null,
        isCanonical: canonicalTicketId === ticketId,
        legacyRecord: !canonicalTicket && invoice ? "legacy_record_without_job" : null
      }
    };
    return {
      summary,
      timeline: finalTimeline,
      ticketSnapshot: canonicalTicket,
      jobSnapshot: activeJob,
      userSnapshot: user,
      normalizedFields,
      portalSnapshot: activeJob?.portalSnapshot || null,
      suggestedActions: [canonicalState.message],
      similarProblems: [],
      evidence,
      canonicalTicketId,
      memberTicketIds,
      selectedJobId: activeJob?.id || null
    };
  }
  async retryDiagnostic(ticketId, adminUser) {
    const ticketData = await diagnosticsRepository.getTicket(ticketId);
    if (!ticketData) {
      throw new Error("TICKET_NOT_FOUND");
    }
    const invoiceId = ticketData.invoiceId || "";
    if (invoiceId) {
      const invData = await diagnosticsRepository.getInvoiceByUserIdAndId(ticketData.userId, invoiceId);
      if (invData && (invData.validationStatus === "sat_validated" || invData.isCfdiValidated)) {
        throw new Error("ALREADY_SAT_VALIDATED");
      }
    }
    const recoveryAttemptCount = 0;
    const nextRecoveryAt = (/* @__PURE__ */ new Date()).toISOString();
    await diagnosticsRepository.updateTicket(ticketId, {
      status: "invoice_recovery_pending",
      recoveryAttemptCount,
      nextRecoveryAt,
      manualRecoveryRequested: true,
      manualRecoveryRequestedAt: nextRecoveryAt,
      manualRecoveryRequestedBy: adminUser.uid || adminUser.id,
      errorCode: null,
      reviewReasonCode: null,
      errorMsg: "Recuperaci\xF3n de factura solicitada manualmente por el Admin.",
      updatedAt: nextRecoveryAt
    });
    const jobDoc = await diagnosticsRepository.getJobByTicketId(ticketId);
    let jobId = "";
    if (jobDoc) {
      jobId = jobDoc.id;
      await diagnosticsRepository.updateJob(jobId, {
        status: "pending_local",
        recoveryAttemptCount,
        nextRecoveryAt,
        manualRecoveryRequested: true,
        manualRecoveryRequestedAt: nextRecoveryAt,
        manualRecoveryRequestedBy: adminUser.uid || adminUser.id,
        retryCount: 0,
        attempts: 0,
        lastError: null,
        lastErrorCode: null,
        updatedAt: nextRecoveryAt
      });
    } else {
      jobId = await diagnosticsRepository.createJob({
        ticketId,
        userId: ticketData.userId,
        status: "pending_local",
        connectorId: ticketData.connectorId || "oxxo",
        portalMapId: ticketData.connectorId || "oxxo",
        attempts: 0,
        retryCount: 0,
        recoveryAttemptCount,
        nextRecoveryAt,
        manualRecoveryRequested: true,
        manualRecoveryRequestedAt: nextRecoveryAt,
        manualRecoveryRequestedBy: adminUser.uid || adminUser.id,
        createdAt: nextRecoveryAt,
        updatedAt: nextRecoveryAt
      });
    }
    const adminEmailMasked = adminUser.email ? adminUser.email[0] + "***@" + adminUser.email.split("@")[1] : "admin@zenticket.com";
    const event = {
      userId: ticketData.userId,
      userEmailMasked: adminEmailMasked,
      ticketId,
      jobId,
      connectorId: ticketData.connectorId || "unknown",
      portalName: (ticketData.connectorId || "unknown").split("_")[0],
      ticketReference: ticketData.reference || "S/D",
      normalizedFields: {
        folio: ticketData.portalFields?.billingReference || null,
        itu: ticketData.portalFields?.itu || null,
        total: ticketData.expectedTicketTotal || null,
        fechaCompra: ticketData.fechaCompra || null,
        rfcReceptorMasked: "XAXX******XXX",
        emailMasked: adminEmailMasked
      },
      stage: "admin_action_retry_requested",
      status: "started",
      extraStatus: "started",
      severity: "info",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      retryable: true,
      requiresManualReview: false,
      problemSignature: "admin_retry",
      safeForAdmin: true,
      recoveryAttemptCount: 0,
      maxRecoveryAttempts: 3
    };
    await diagnosticsRepository.addRunnerDiagnostic(event);
    return { jobId };
  }
  async markReviewed(ticketId, note, adminUser) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const adminEmail = adminUser.email || "admin@zenticket.com";
    const summarySnap = await diagnosticsRepository.getSummary(ticketId);
    if (!summarySnap) {
      const detail = await this.getDiagnosticDetail(ticketId);
      if (detail && detail.summary) {
        const derivedSummary = { ...detail.summary, id: ticketId };
        await diagnosticsRepository.createSummary(ticketId, derivedSummary);
      } else {
        await diagnosticsRepository.createSummary(ticketId, {
          ticketId,
          createdAt: timestamp,
          updatedAt: timestamp
        });
      }
    }
    await diagnosticsRepository.updateSummary(ticketId, {
      reviewed: true,
      reviewedAt: timestamp,
      reviewedBy: adminEmail,
      reviewedNote: note || null,
      diagnosticStatus: "reviewed"
    });
    return { success: true };
  }
  async archiveDiagnostic(ticketId, reason, comment, adminUser) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const adminEmail = adminUser.email || adminUser.uid || "admin@zenticket.com";
    const archivedReasonText = `${reason}${comment ? `: ${comment}` : ""}`;
    const detail = await this.getDiagnosticDetail(ticketId);
    if (!detail) {
      throw new Error("TICKET_NOT_FOUND");
    }
    const summarySnap = detail.summary;
    if (summarySnap && (summarySnap.diagnosticStatus === "archived" || summarySnap.canonicalStatus === "archived")) {
      return { success: true };
    }
    const ticketIds = detail.memberTicketIds && detail.memberTicketIds.length > 0 ? detail.memberTicketIds : [ticketId];
    for (const tid of ticketIds) {
      const summary = await diagnosticsRepository.getSummary(tid);
      const previousDiagnosticStatus = summary?.diagnosticStatus || "pending";
      if (!summary) {
        const tkt = await diagnosticsRepository.getTicket(tid);
        if (tkt) {
          await diagnosticsRepository.createSummary(tid, {
            ticketId: tid,
            createdAt: tkt.createdAt || timestamp,
            updatedAt: timestamp
          });
        } else {
          await diagnosticsRepository.createSummary(tid, {
            ticketId: tid,
            createdAt: timestamp,
            updatedAt: timestamp
          });
        }
      }
      await diagnosticsRepository.updateTicket(tid, {
        archived: true,
        archivedAt: timestamp,
        archivedBy: adminEmail,
        archivedReason: reason,
        archivedComment: comment || null,
        hiddenFromActiveDiagnostics: true,
        status: "archived",
        updatedAt: timestamp
      });
      await diagnosticsRepository.updateSummary(tid, {
        archivedAt: timestamp,
        archiveReason: reason,
        archiveComment: comment || null,
        archivedReason: archivedReasonText,
        archivedBy: adminEmail,
        visibility: "archived",
        diagnosticStatus: "archived",
        previousDiagnosticStatus,
        updatedAt: timestamp
      });
      const job = await diagnosticsRepository.getJobByTicketId(tid);
      if (job) {
        await diagnosticsRepository.updateJob(job.id, {
          archivedAt: timestamp,
          archivedReason: archivedReasonText
        });
      }
      await diagnosticsRepository.archiveRunnerDiagnostics(tid, {
        archivedAt: timestamp,
        archivedReason: archivedReasonText,
        archivedBy: adminEmail,
        visibility: "archived"
      });
      await diagnosticsRepository.writeAuditLog({
        adminUserId: adminUser?.uid || adminUser?.userId || "admin",
        ticketId: tid,
        action: "archive_diagnostic",
        reason,
        comment: comment || null,
        createdAt: timestamp,
        previousDiagnosticStatus
      });
      await diagnosticsRepository.writeAdminAuditLog({
        adminUserId: adminUser?.uid || adminUser?.userId || "admin",
        ticketId: tid,
        action: "archive_diagnostic",
        reason,
        comment: comment || null,
        createdAt: timestamp,
        previousDiagnosticStatus
      });
    }
    return { success: true };
  }
  async createConnectorTask(ticketId, adminUser) {
    const detail = await this.getDiagnosticDetail(ticketId);
    if (!detail) throw new Error("TICKET_NOT_FOUND");
    const summary = detail.summary;
    const ticket = detail.ticketSnapshot;
    const job = detail.jobSnapshot;
    const task = {
      connectorId: ticket.connectorId || "unknown",
      portalName: (ticket.connectorId || "unknown").split("_")[0],
      ticketId,
      jobId: job?.id || "unknown",
      errorCode: ticket.reviewReasonCode || ticket.errorCode || "unknown",
      failedStage: summary?.failedStage || "unknown",
      problemSignature: summary?.problemSignature || "unknown",
      summary: summary?.plainLanguageProblem || "Incidencia de facturaci\xF3n",
      evidence: {
        portalMessage: summary?.technicalCause || null,
        lastFailedStage: summary?.failedStage || null
      },
      status: "open",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      createdBy: adminUser.email || "admin@zenticket.com"
    };
    const taskId = await diagnosticsRepository.createConnectorTask(task);
    return { taskId };
  }
  async prepareFixProposal(ticketId, adminUser) {
    if (process.env.GEMINI_DIAGNOSTIC_ENABLED !== "true") {
      throw new Error("GEMINI_DIAGNOSTIC_DISABLED");
    }
    const ticket = await diagnosticsRepository.getTicket(ticketId);
    if (!ticket) {
      throw new Error("TICKET_NOT_FOUND");
    }
    const job = await diagnosticsRepository.getJobByTicketId(ticketId);
    let invoice = null;
    if (ticket.invoiceId) {
      invoice = await diagnosticsRepository.getInvoice(ticket.userId, ticket.invoiceId);
    }
    const cState = getBillingCanonicalState({ ticket, job, invoice });
    const params = {
      ticketId: ticket.id,
      userId: ticket.userId,
      connectorId: ticket.connectorId || "unknown",
      affectedPortal: ticket.portal || "unknown",
      canonicalStatus: cState.canonicalStatus,
      failedStage: ticket.failedStage || job?.lastFailedStage || "unknown",
      problemSignature: ticket.problemSignature || "unknown",
      sanitizedTimeline: ticket.timeline || [],
      sanitizedPortalSnapshot: job?.portalSnapshot || ticket.portalSnapshot || {},
      normalizedFields: ticket.normalizedFields || {},
      currentConnectorMetadata: job?.metadata || {},
      knownLearningEntries: [],
      runnerErrorCode: ticket.errorCode || job?.lastError || "",
      portalMessage: ticket.portalMessage || "",
      missingArtifacts: ticket.missingArtifacts || [],
      technicalMessage: ticket.technicalMessage || ""
    };
    const jsonStr = JSON.stringify(params);
    const sanitizedInputHash = import_crypto.default.createHash("sha256").update(jsonStr).digest("hex");
    const cachedProposal = await aiBudgetService.checkCacheOnly(sanitizedInputHash);
    if (cachedProposal) {
      return { proposal: cachedProposal };
    }
    const quotaKeys = await aiBudgetService.reserveQuota(ticketId);
    let result;
    try {
      try {
        result = await diagnosticAiService.generateDiagnosticFixProposal(params);
      } catch (err) {
        await aiBudgetService.logUsage({
          adminUserId: adminUser?.uid || adminUser?.userId || "admin",
          ticketId: ticket.id,
          connectorId: ticket.connectorId || "unknown",
          model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
          status: "failed",
          error: err.message || err.toString()
        });
        throw err;
      }
      let validated;
      try {
        validated = connectorPatchProposalSchema.parse(result);
      } catch (err) {
        await aiBudgetService.logUsage({
          adminUserId: adminUser?.uid || adminUser?.userId || "admin",
          ticketId: ticket.id,
          connectorId: ticket.connectorId || "unknown",
          model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
          status: "invalid_output",
          error: "Zod validation failed: " + err.message
        });
        throw new Error("INVALID_AI_OUTPUT");
      }
      if (validated.forbiddenActionsDetected && validated.forbiddenActionsDetected.length > 0) {
        const db = diagnosticsRepository.getDbSafe();
        const rejectRef = db.collection("rejected_ai_output").doc();
        await rejectRef.set({
          requestId: rejectRef.id,
          ticketId: ticket.id,
          userId: ticket.userId,
          connectorId: ticket.connectorId || "unknown",
          sanitizedInputHash,
          output: validated,
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          createdBy: "gemini",
          reason: "FORBIDDEN_ACTIONS_DETECTED"
        });
        await aiBudgetService.logUsage({
          adminUserId: adminUser?.uid || adminUser?.userId || "admin",
          ticketId: ticket.id,
          connectorId: ticket.connectorId || "unknown",
          model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
          status: "rejected_forbidden_actions"
        });
        throw new Error("AI_PROPOSAL_REJECTED_FORBIDDEN_ACTIONS");
      }
      const proposalData = {
        ticketId: ticket.id,
        jobId: job?.id || null,
        userId: ticket.userId,
        connectorId: ticket.connectorId || "unknown",
        affectedPortal: ticket.portal || "unknown",
        problemSignature: ticket.problemSignature || "unknown",
        summary: validated.summary,
        plainLanguageProblem: validated.plainLanguageProblem,
        stoppedAtStage: validated.stoppedAtStage,
        likelyCause: validated.likelyCause,
        proposedConnectorChanges: validated.proposedConnectorChanges,
        recoveryFlowProposal: validated.recoveryFlowProposal || null,
        confidence: validated.confidence,
        riskLevel: validated.proposedConnectorChanges.riskLevel,
        sanitizedInputHash
      };
      const savedProposal = await connectorLearningService.createPatchProposal(proposalData);
      await aiBudgetService.logUsage({
        adminUserId: adminUser?.uid || adminUser?.userId || "admin",
        ticketId: ticket.id,
        connectorId: ticket.connectorId || "unknown",
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        status: "success"
      });
      return { proposal: savedProposal };
    } catch (finalErr) {
      await aiBudgetService.releaseQuota(quotaKeys).catch((releaseErr) => {
        console.error("Error releasing budget quota:", releaseErr);
      });
      throw finalErr;
    }
  }
  async getScreenshotSignedUrl(ticketId) {
    const detail = await this.getDiagnosticDetail(ticketId);
    if (!detail) {
      throw new Error("TICKET_NOT_FOUND");
    }
    const screenshotPath = detail.evidence?.screenshot?.storagePath || detail.jobSnapshot?.evidenceScreenshotPath || detail.jobSnapshot?.portalSnapshot?.screenshotPath || detail.timeline && detail.timeline.find((t) => t.screenshotPath)?.screenshotPath;
    if (!screenshotPath) {
      throw new Error("SCREENSHOT_NOT_FOUND");
    }
    let cleanPath = screenshotPath;
    if (cleanPath.startsWith("gs://")) {
      const parts = cleanPath.replace("gs://", "").split("/");
      parts.shift();
      cleanPath = parts.join("/");
    }
    try {
      const bucket = (0, import_storage.getStorage)().bucket();
      const fileRef = bucket.file(cleanPath);
      const [exists] = await fileRef.exists();
      if (!exists) {
        throw new Error("SCREENSHOT_FILE_DOES_NOT_EXIST");
      }
      const [url] = await fileRef.getSignedUrl({
        action: "read",
        expires: Date.now() + 15 * 60 * 1e3
        // 15 minutes expiration
      });
      return url;
    } catch (err) {
      if (err.message === "SCREENSHOT_FILE_DOES_NOT_EXIST") {
        throw err;
      }
      console.error("Error generating signed URL for screenshot:", err);
      throw new Error("FAILED_TO_GENERATE_SIGNED_URL");
    }
  }
  async getDebugSources(filters) {
    const creds = diagnosticsRepository.getCredentialsMetadata();
    const diagnosticSummariesCount = await diagnosticsRepository.getDiagnosticSummariesCount();
    const problematicTickets = await diagnosticsRepository.listProblematicTickets(filters);
    const problematicTicketsPhysicalCount = problematicTickets.length;
    const problematicJobs = await diagnosticsRepository.listProblematicJobs(filters);
    const problematicJobsCount = problematicJobs.length;
    let candidateTicketsCanonicalCount = 0;
    const sampleProblematicTickets = [];
    for (const ticket of problematicTickets) {
      if (ticket.hiddenFromUser === true || ticket.deletedAt || ticket.status === "deleted" || ticket.linkedTicketDeleted === true) {
        continue;
      }
      let job = problematicJobs.find((j) => j.ticketId === ticket.id) || null;
      if (!job) {
        job = await diagnosticsRepository.getJobByTicketId(ticket.id);
      }
      let invoice = null;
      if (ticket.invoiceId) {
        invoice = await diagnosticsRepository.getInvoice(ticket.userId, ticket.invoiceId);
      }
      const canonicalState = getBillingCanonicalState({ ticket, job, invoice });
      const problematicCanonicalStatuses = [
        "requires_manual_review",
        "already_invoiced_unverified",
        "invoice_recovery_pending",
        "invoice_recovery_retrying",
        "requires_field_correction",
        "cfdi_validation_failed",
        "sat_validation_failed",
        "automation_failed",
        "failed_blocking"
      ];
      if (problematicCanonicalStatuses.includes(canonicalState.canonicalStatus)) {
        candidateTicketsCanonicalCount++;
        if (sampleProblematicTickets.length < 5) {
          sampleProblematicTickets.push({
            ticketId: ticket.id,
            ticketReference: ticket.folio || ticket.reference || ticket.billingReference || "S/D",
            physicalStatus: ticket.status,
            canonicalStatus: canonicalState.canonicalStatus,
            connectorId: ticket.connectorId || "unknown",
            hiddenFromUser: ticket.hiddenFromUser || false,
            hasDeletedAt: !!ticket.deletedAt
          });
        }
      }
    }
    const listRes = await this.listDiagnostics(filters);
    const mergedCount = listRes.items.length;
    return {
      projectId: creds.projectId,
      credentialMode: creds.credentialMode,
      emulatorHostEnabled: creds.emulatorHostEnabled,
      diagnosticSummariesCount,
      problematicTicketsPhysicalCount,
      candidateTicketsCanonicalCount,
      problematicJobsCount,
      mergedCount,
      filtersApplied: filters,
      sampleProblematicTickets
    };
  }
};
var adminDiagnosticsService = new AdminDiagnosticsService();

// server/schemas/adminDiagnostics.schema.ts
var import_zod2 = require("zod");
var listDiagnosticsSchema = import_zod2.z.object({
  query: import_zod2.z.object({
    userId: import_zod2.z.string().optional(),
    connectorId: import_zod2.z.string().optional(),
    portalName: import_zod2.z.string().optional(),
    ticketId: import_zod2.z.string().optional(),
    ticketReference: import_zod2.z.string().optional(),
    jobId: import_zod2.z.string().optional(),
    stage: import_zod2.z.string().optional(),
    errorCode: import_zod2.z.string().optional(),
    severity: import_zod2.z.enum(["info", "warning", "error", "critical"]).optional(),
    status: import_zod2.z.string().optional(),
    requiresManualReview: import_zod2.z.string().transform((val) => val === "true").optional(),
    retryable: import_zod2.z.string().transform((val) => val === "true").optional(),
    problemSignature: import_zod2.z.string().optional(),
    dateFrom: import_zod2.z.string().datetime().optional(),
    dateTo: import_zod2.z.string().datetime().optional(),
    visibility: import_zod2.z.enum(["active", "archived", "all"]).optional().default("active"),
    view: import_zod2.z.enum(["by_user", "in_process", "attention", "failed", "ready", "archived", "all"]).optional().default("by_user"),
    limit: import_zod2.z.string().optional().transform((val) => val ? Math.min(parseInt(val, 10), 100) : 20),
    cursor: import_zod2.z.string().optional()
  })
});
var getDiagnosticDetailSchema = import_zod2.z.object({
  params: import_zod2.z.object({
    ticketId: import_zod2.z.string().min(1, "El ticketId es obligatorio")
  })
});
var markReviewedSchema = import_zod2.z.object({
  params: import_zod2.z.object({
    ticketId: import_zod2.z.string().min(1, "El ticketId es obligatorio")
  }),
  body: import_zod2.z.object({
    note: import_zod2.z.string().max(500, "La nota no debe exceder 500 caracteres").optional()
  })
});
var createConnectorTaskSchema = import_zod2.z.object({
  params: import_zod2.z.object({
    ticketId: import_zod2.z.string().min(1, "El ticketId es obligatorio")
  })
});
var proposeFixSchema = import_zod2.z.object({
  params: import_zod2.z.object({
    ticketId: import_zod2.z.string().min(1, "El ticketId es obligatorio")
  })
});
var proposalActionSchema = import_zod2.z.object({
  params: import_zod2.z.object({
    proposalId: import_zod2.z.string().min(1, "El proposalId es obligatorio")
  }),
  body: import_zod2.z.object({
    comment: import_zod2.z.string().max(500, "El comentario no debe exceder 500 caracteres").optional()
  }).optional()
});
var listProposalsSchema = import_zod2.z.object({
  query: import_zod2.z.object({
    connectorId: import_zod2.z.string().optional(),
    status: import_zod2.z.string().optional()
  })
});
var archiveDiagnosticSchema = import_zod2.z.object({
  params: import_zod2.z.object({
    ticketId: import_zod2.z.string().min(1, "El ticketId es obligatorio")
  }),
  body: import_zod2.z.object({
    reason: import_zod2.z.enum(["portal_change", "user_error", "captcha_required", "service_down", "manual_resolution", "other"]),
    comment: import_zod2.z.string().max(500, "El comentario no debe exceder 500 caracteres").optional()
  })
});

// server/controllers/adminDiagnostics.controller.ts
var AdminDiagnosticsController = class {
  async listDiagnostics(req, res) {
    try {
      const parsed = listDiagnosticsSchema.parse({ query: req.query });
      const result = await adminDiagnosticsService.listDiagnostics(parsed.query);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message || err.toString() });
    }
  }
  async getDiagnosticDetail(req, res) {
    try {
      const parsed = getDiagnosticDetailSchema.parse({ params: req.params });
      const result = await adminDiagnosticsService.getDiagnosticDetail(parsed.params.ticketId);
      if (!result) {
        res.status(404).json({ error: "Diagn\xF3stico no encontrado." });
        return;
      }
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message || err.toString() });
    }
  }
  async retryDiagnostic(req, res) {
    try {
      const parsed = getDiagnosticDetailSchema.parse({ params: req.params });
      const adminUser = req.user;
      const result = await adminDiagnosticsService.retryDiagnostic(parsed.params.ticketId, adminUser);
      res.json(result);
    } catch (err) {
      if (err.message === "TICKET_NOT_FOUND") {
        res.status(404).json({ error: "Ticket no encontrado." });
      } else if (err.message === "ALREADY_SAT_VALIDATED") {
        res.status(400).json({ error: "El ticket ya cuenta con una factura real validada ante el SAT." });
      } else {
        res.status(500).json({ error: err.message || err.toString() });
      }
    }
  }
  async markReviewed(req, res) {
    try {
      const parsed = markReviewedSchema.parse({ params: req.params, body: req.body });
      const adminUser = req.user;
      const result = await adminDiagnosticsService.markReviewed(
        parsed.params.ticketId,
        parsed.body.note,
        adminUser
      );
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message || err.toString() });
    }
  }
  async archiveDiagnostic(req, res) {
    try {
      const parsed = archiveDiagnosticSchema.parse({ params: req.params, body: req.body });
      const adminUser = req.user;
      const result = await adminDiagnosticsService.archiveDiagnostic(
        parsed.params.ticketId,
        parsed.body.reason,
        parsed.body.comment,
        adminUser
      );
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message || err.toString() });
    }
  }
  async getScreenshotUrl(req, res) {
    try {
      const parsed = getDiagnosticDetailSchema.parse({ params: req.params });
      const url = await adminDiagnosticsService.getScreenshotSignedUrl(parsed.params.ticketId);
      res.json({ url });
    } catch (err) {
      if (err.message === "SCREENSHOT_NOT_FOUND" || err.message === "SCREENSHOT_FILE_DOES_NOT_EXIST") {
        res.status(404).json({ error: "Captura de pantalla no disponible en Storage." });
      } else {
        res.status(err.message === "TICKET_NOT_FOUND" ? 404 : 500).json({ error: err.message || err.toString() });
      }
    }
  }
  async createConnectorTask(req, res) {
    try {
      const parsed = createConnectorTaskSchema.parse({ params: req.params });
      const adminUser = req.user;
      const result = await adminDiagnosticsService.createConnectorTask(parsed.params.ticketId, adminUser);
      res.json(result);
    } catch (err) {
      if (err.message === "TICKET_NOT_FOUND") {
        res.status(404).json({ error: "Ticket no encontrado." });
      } else {
        res.status(500).json({ error: err.message || err.toString() });
      }
    }
  }
  async proposeFix(req, res) {
    try {
      const parsed = proposeFixSchema.parse({ params: req.params });
      const adminUser = req.user;
      const result = await adminDiagnosticsService.prepareFixProposal(parsed.params.ticketId, adminUser);
      res.json(result);
    } catch (err) {
      if (err.message === "GEMINI_DIAGNOSTIC_DISABLED") {
        res.status(503).json({ error: "Gemini no est\xE1 habilitado para diagn\xF3stico." });
      } else if (err.message === "DAILY_BUDGET_EXCEEDED" || err.message === "MONTHLY_BUDGET_EXCEEDED" || err.message === "TICKET_BUDGET_EXCEEDED") {
        res.status(429).json({ error: `L\xEDmite de solicitudes AI superado: ${err.message}` });
      } else if (err.message === "AI_PROPOSAL_REJECTED_FORBIDDEN_ACTIONS") {
        res.status(400).json({ error: "Propuesta de parche rechazada por detectar acciones prohibidas." });
      } else {
        res.status(500).json({ error: err.message || err.toString() });
      }
    }
  }
  async getDebugSources(req, res) {
    try {
      const result = await adminDiagnosticsService.getDebugSources(req.query);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message || err.toString() });
    }
  }
  async listProposals(req, res) {
    try {
      const parsed = listProposalsSchema.parse({ query: req.query });
      const result = await connectorLearningService.listPatchProposals(parsed.query);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message || err.toString() });
    }
  }
  async approveProposalSandbox(req, res) {
    try {
      const parsed = proposalActionSchema.parse({ params: req.params, body: req.body });
      const adminUser = req.user;
      await connectorLearningService.approveForSandbox(parsed.params.proposalId, adminUser);
      res.json({ success: true });
    } catch (err) {
      res.status(err.message === "PROPOSAL_NOT_FOUND" ? 404 : 500).json({ error: err.message || err.toString() });
    }
  }
  async rejectProposal(req, res) {
    try {
      const parsed = proposalActionSchema.parse({ params: req.params, body: req.body });
      const adminUser = req.user;
      await connectorLearningService.rejectProposal(parsed.params.proposalId, adminUser);
      res.json({ success: true });
    } catch (err) {
      res.status(err.message === "PROPOSAL_NOT_FOUND" ? 404 : 500).json({ error: err.message || err.toString() });
    }
  }
  async requestRevisionProposal(req, res) {
    try {
      const parsed = proposalActionSchema.parse({ params: req.params, body: req.body });
      const adminUser = req.user;
      const comment = parsed.body?.comment || "Revision requested by admin";
      await connectorLearningService.requestRevision(parsed.params.proposalId, comment, adminUser);
      res.json({ success: true });
    } catch (err) {
      res.status(err.message === "PROPOSAL_NOT_FOUND" ? 404 : 500).json({ error: err.message || err.toString() });
    }
  }
  async promoteProposalObservation(req, res) {
    try {
      const parsed = proposalActionSchema.parse({ params: req.params, body: req.body });
      const adminUser = req.user;
      await connectorLearningService.promoteToObservation(parsed.params.proposalId, adminUser);
      res.json({ success: true });
    } catch (err) {
      res.status(err.message === "PROPOSAL_NOT_FOUND" ? 404 : 500).json({ error: err.message || err.toString() });
    }
  }
  async promoteProposalActive(req, res) {
    try {
      const parsed = proposalActionSchema.parse({ params: req.params });
      const adminUser = req.user;
      await connectorLearningService.promoteToActive(parsed.params.proposalId, adminUser);
      res.json({ success: true });
    } catch (err) {
      if (err.message === "CANNOT_PROMOTE_PENDING_DIRECTLY_TO_ACTIVE") {
        res.status(400).json({ error: "No se puede promover una propuesta directamente desde revisi\xF3n a activa sin pasar por sandbox." });
      } else {
        res.status(err.message === "PROPOSAL_NOT_FOUND" ? 404 : 500).json({ error: err.message || err.toString() });
      }
    }
  }
};
var adminDiagnosticsController = new AdminDiagnosticsController();

// server/middleware/auth.middleware.ts
var import_auth = require("firebase-admin/auth");
var isBypassForbidden = () => {
  const isProdEnv = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "prod";
  const isCloudHost = !!(process.env.VERCEL || process.env.RENDER || process.env.GAE_INSTANCE || process.env.K_SERVICE);
  const hasLiveStripe = (process.env.STRIPE_SECRET_KEY || "").includes("sk_live");
  if (process.env.DEV_BILLING_AUTH_BYPASS === "true" && !isProdEnv && !isCloudHost && !hasLiveStripe && process.env.VITEST !== "true") {
    return false;
  }
  const hasRealCreds = !!(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS);
  return isProdEnv || hasRealCreds || isCloudHost || hasLiveStripe;
};
var authenticateFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const hasRealCredentials = !!(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS) || process.env.NODE_ENV === "production" || process.env.NODE_ENV === "prod" || !!process.env.K_SERVICE || !!process.env.FUNCTION_NAME;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    if (process.env.DEV_BILLING_AUTH_BYPASS === "true") {
      if (isBypassForbidden()) {
        console.error("CRITICAL SECURITY WARNING: Blocked DEV_BILLING_AUTH_BYPASS execution in a non-local or production environment.");
        res.status(401).json({ error: "Falta el token de autorizaci\xF3n o es inv\xE1lido" });
        return;
      }
      const mockUid = req.headers["x-mock-user-id"];
      const mockEmail = req.headers["x-mock-user-email"];
      if (mockUid) {
        req.user = {
          uid: mockUid,
          email: mockEmail || "mock@example.com",
          email_verified: true,
          role: mockEmail && (mockEmail.toLowerCase().includes("ricardo") || mockEmail.toLowerCase().includes("legionrender")) ? "admin" : "user",
          claims: {}
        };
        next();
        return;
      }
    }
    res.status(401).json({ error: "Falta el token de autorizaci\xF3n o es inv\xE1lido" });
    return;
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    if (!hasRealCredentials) {
      if (process.env.DEV_BILLING_AUTH_BYPASS === "true") {
        if (isBypassForbidden()) {
          console.error("CRITICAL SECURITY WARNING: Blocked DEV_BILLING_AUTH_BYPASS execution in a non-local or production environment.");
          res.status(401).json({ error: "Desarrollo local: Habilite DEV_BILLING_AUTH_BYPASS para pruebas" });
          return;
        }
        const mockUid = req.headers["x-mock-user-id"] || "mock-local-uid";
        const mockEmail = req.headers["x-mock-user-email"] || "mock@example.com";
        req.user = {
          uid: mockUid,
          email: mockEmail,
          email_verified: true,
          role: mockEmail && (mockEmail.toLowerCase().includes("ricardo") || mockEmail.toLowerCase().includes("legionrender")) ? "admin" : "user",
          claims: {}
        };
        next();
        return;
      }
      res.status(401).json({ error: "Desarrollo local: Habilite DEV_BILLING_AUTH_BYPASS para pruebas" });
      return;
    }
    const decodedToken = await (0, import_auth.getAuth)().verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || "",
      email_verified: decodedToken.email_verified === true,
      claims: decodedToken,
      role: decodedToken.role || (decodedToken.email && (decodedToken.email.toLowerCase().includes("ricardo") || decodedToken.email.toLowerCase().includes("legionrender")) ? "admin" : "user")
    };
    next();
  } catch (error) {
    console.error("Error al verificar token de Firebase:", error.message);
    res.status(401).json({ error: "Token de Firebase inv\xE1lido o expirado" });
  }
};

// server/middleware/admin.middleware.ts
var requireAdmin = async (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: "Usuario no autenticado." });
    return;
  }
  const email = (req.user.email || "").toLowerCase();
  const isAdmin = email === "ricardo@zenticket.mx" || email === "legionrender@gmail.com" || req.user.role === "admin" || req.user.claims && req.user.claims.admin === true;
  if (!isAdmin) {
    res.status(403).json({ error: "Acceso denegado. Se requiere rol de administrador." });
    return;
  }
  next();
};

// server/routes/adminDiagnostics.routes.ts
var router = (0, import_express.Router)();
router.use(authenticateFirebaseToken, requireAdmin);
router.get("/", adminDiagnosticsController.listDiagnostics);
router.get("/debug/sources", adminDiagnosticsController.getDebugSources);
router.get("/proposals", adminDiagnosticsController.listProposals);
router.post("/proposals/:proposalId/approve-sandbox", adminDiagnosticsController.approveProposalSandbox);
router.post("/proposals/:proposalId/reject", adminDiagnosticsController.rejectProposal);
router.post("/proposals/:proposalId/request-revision", adminDiagnosticsController.requestRevisionProposal);
router.post("/proposals/:proposalId/promote-observation", adminDiagnosticsController.promoteProposalObservation);
router.post("/proposals/:proposalId/promote-active", adminDiagnosticsController.promoteProposalActive);
router.get("/:ticketId", adminDiagnosticsController.getDiagnosticDetail);
router.get("/:ticketId/screenshot", adminDiagnosticsController.getScreenshotUrl);
router.post("/:ticketId/retry", adminDiagnosticsController.retryDiagnostic);
router.post("/:ticketId/mark-reviewed", adminDiagnosticsController.markReviewed);
router.post("/:ticketId/archive", adminDiagnosticsController.archiveDiagnostic);
router.post("/:ticketId/create-connector-task", adminDiagnosticsController.createConnectorTask);
router.post("/:ticketId/propose-fix", adminDiagnosticsController.proposeFix);
router.use("*", (req, res) => {
  res.status(404).json({ error: "Ruta de diagn\xF3stico no encontrada." });
});
var adminDiagnostics_routes_default = router;
