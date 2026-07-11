const crypto = require("crypto");

const ACTIVE_JOB_STATUSES = new Set([
  "pending",
  "pending_local",
  "locked",
  "running",
  "queued_for_runner",
  "waiting_user_action",
  "waiting_user_input",
  "waiting_user_verification",
  "verifying_captcha",
  "captcha_submitted",
  "invoice_recovery_pending",
  "invoice_recovery_retrying",
  "validating_sat"
]);

const TERMINAL_SUCCESS_STATUSES = new Set(["succeeded", "cfdi_validated", "sat_validated", "invoice_obtained"]);
const ELIGIBLE_CONNECTOR_STATUSES = new Set(["production_ready", "approved_for_observation", "observation", "real_validation"]);
const ELIGIBLE_PORTAL_MAP_STATUSES = new Set(["production_ready", "approved_for_observation", "observation", "approved"]);

class InvoiceEnqueueError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = "InvoiceEnqueueError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function valueOrEmpty(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function validIdempotencyKey(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value);
}

function validTicketId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && !value.includes("/");
}

function validJobId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && !value.includes("/");
}

function requiredPortalFields(connector, portalMap) {
  const fromContract = connector?.extractionContract?.requiredPortalFields;
  if (Array.isArray(fromContract) && fromContract.length > 0) return fromContract;

  const fromMap = Array.isArray(portalMap?.requiredFields) ? portalMap.requiredFields : [];
  return fromMap.filter((field) => {
    const key = typeof field === "string" ? field : field?.key;
    const source = typeof field === "string" ? "" : field?.source;
    return source === "portalFields" || String(key || "").startsWith("portalFields.");
  });
}

function portalFieldKey(field) {
  const raw = typeof field === "string" ? field : field?.key || field?.canonicalKey || "";
  return String(raw).replace(/^portalFields\./, "").trim();
}

function buildTicketSnapshot(ticket) {
  const portalFields = ticket?.portalFields && typeof ticket.portalFields === "object" ? ticket.portalFields : {};
  const totalCandidate = ticket?.expectedTicketTotal ?? ticket?.total ?? portalFields.total;
  const expectedTicketTotal = Number(totalCandidate);
  if (!Number.isFinite(expectedTicketTotal) || expectedTicketTotal <= 0) {
    throw new InvoiceEnqueueError("INVALID_TICKET_TOTAL", "El total del ticket debe ser un valor real y mayor a cero.", 422);
  }

  return {
    merchantName: valueOrEmpty(ticket?.nombreEmisor || ticket?.merchantName),
    rfcEmisor: valueOrEmpty(ticket?.rfcEmisor),
    purchaseDate: valueOrEmpty(ticket?.fechaCompra || ticket?.fecha),
    portalFields: { ...portalFields },
    expectedTicketTotal,
    rawOcrText: valueOrEmpty(ticket?.rawOcrText)
  };
}

function buildFiscalProfileSnapshot(profile) {
  const snapshot = {
    rfc: valueOrEmpty(profile?.rfc),
    razonSocial: valueOrEmpty(profile?.razonSocial || profile?.businessName),
    regimenFiscal: valueOrEmpty(profile?.regimenFiscal || profile?.taxRegime),
    codigoPostal: valueOrEmpty(profile?.codigoPostal || profile?.postalCode),
    usoCFDI: valueOrEmpty(profile?.usoCFDI || profile?.cfdiUse),
    correoElectronico: valueOrEmpty(profile?.correoElectronico || profile?.correoRecepcion || profile?.email)
  };
  const missing = Object.entries(snapshot).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    throw new InvoiceEnqueueError("MISSING_FISCAL_PROFILE_DATA", "Faltan datos fiscales requeridos para encolar la factura.", 422, { missing });
  }
  return snapshot;
}

function assertConnectorAndPortalMap(connector, portalMap, connectorId, portalMapId) {
  if (!connector) throw new InvoiceEnqueueError("CONNECTOR_NOT_FOUND", "No existe un conector para este ticket.", 409);
  if (connector.runnerAvailable === false || ["disabled", "runner_not_available", "observation_blocked"].includes(connector.status)) {
    throw new InvoiceEnqueueError("CONNECTOR_NOT_AVAILABLE", "Este conector no esta disponible para automatizacion.", 409);
  }
  if (connector.status && !ELIGIBLE_CONNECTOR_STATUSES.has(connector.status)) {
    throw new InvoiceEnqueueError("CONNECTOR_NOT_ELIGIBLE", "El conector no esta en un estado elegible para automatizacion.", 409);
  }
  if (!portalMap) throw new InvoiceEnqueueError("PORTAL_MAP_NOT_FOUND", "No existe un portal map para este conector.", 409);
  if (portalMap.connectorId && portalMap.connectorId !== connectorId) {
    throw new InvoiceEnqueueError("PORTAL_MAP_CONNECTOR_MISMATCH", "El portal map no pertenece al conector del ticket.", 409);
  }
  if (portalMap.isGenericTemplate === true || portalMap.isApproved === false || !ELIGIBLE_PORTAL_MAP_STATUSES.has(portalMap.status || "")) {
    throw new InvoiceEnqueueError("PORTAL_MAP_NOT_APPROVED", "El portal map no esta aprobado para observacion o produccion.", 409, { portalMapId });
  }
}

function assertPortalFieldContract(ticketSnapshot, connector, portalMap) {
  const fields = requiredPortalFields(connector, portalMap);
  if (!fields.length) {
    throw new InvoiceEnqueueError("CONNECTOR_SCHEMA_INVALID", "El conector no declara los campos requeridos del portal.", 409);
  }
  const missing = fields
    .filter((field) => typeof field !== "object" || field.required !== false)
    .map(portalFieldKey)
    .filter(Boolean)
    .filter((key) => !valueOrEmpty(ticketSnapshot.portalFields[key]));
  if (missing.length) {
    throw new InvoiceEnqueueError("MISSING_REQUIRED_FIELDS", "Faltan campos del ticket requeridos por el portal.", 422, { missing: missing.map((key) => `portalFields.${key}`) });
  }
}

function stableJobId(ticketId) {
  return `ticket-${hash(ticketId).slice(0, 40)}`;
}

function isActiveJob(data) {
  return ACTIVE_JOB_STATUSES.has(String(data?.status || ""));
}

async function enqueueInvoiceJob({ db, userId, ticketId, idempotencyKey }) {
  if (!db || typeof db.runTransaction !== "function") throw new InvoiceEnqueueError("DATABASE_UNAVAILABLE", "La cola no esta disponible.", 503);
  if (!userId) throw new InvoiceEnqueueError("UNAUTHENTICATED", "Debes iniciar sesion para encolar una factura.", 401);
  if (!validTicketId(ticketId)) throw new InvoiceEnqueueError("INVALID_TICKET_ID", "El ticket solicitado no es valido.", 400);
  if (!validIdempotencyKey(idempotencyKey)) throw new InvoiceEnqueueError("INVALID_IDEMPOTENCY_KEY", "La solicitud requiere una llave de idempotencia valida.", 400);

  const requestId = `${userId}-${hash(idempotencyKey).slice(0, 48)}`;
  const requestRef = db.collection("invoice_enqueue_requests").doc(requestId);
  const ticketRef = db.collection("tickets").doc(ticketId);
  const jobId = stableJobId(ticketId);
  const jobRef = db.collection("invoice_jobs").doc(jobId);
  const lockRef = db.collection("invoice_ticket_locks").doc(ticketId);
  const outboxRef = db.collection("invoice_job_outbox").doc(jobId);

  return db.runTransaction(async (transaction) => {
    const requestSnap = await transaction.get(requestRef);
    if (requestSnap.exists) {
      const previous = requestSnap.data() || {};
      return { jobId: previous.jobId, status: previous.jobStatus || "pending", idempotent: true };
    }

    const ticketSnap = await transaction.get(ticketRef);
    if (!ticketSnap.exists) throw new InvoiceEnqueueError("TICKET_NOT_FOUND", "El ticket no existe.", 404);
    const ticket = ticketSnap.data() || {};
    if (ticket.userId !== userId) throw new InvoiceEnqueueError("FORBIDDEN", "No tienes acceso a este ticket.", 403);

    const connectorId = valueOrEmpty(ticket.connectorId);
    if (!connectorId) throw new InvoiceEnqueueError("CONNECTOR_NOT_FOUND", "El ticket no tiene un conector resuelto.", 409);
    const portalMapId = valueOrEmpty(ticket.portalMapId) || `map-${connectorId}`;
    const profileRef = db.collection("fiscalProfiles").doc(userId);
    const connectorRef = db.collection("connectors").doc(connectorId);
    const portalMapRef = db.collection("portal_maps").doc(portalMapId);
    const existingJobsQuery = db.collection("invoice_jobs").where("ticketId", "==", ticketId).limit(10);

    const [profileSnap, connectorSnap, portalMapSnap, jobSnap, lockSnap, existingJobsSnap] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(connectorRef),
      transaction.get(portalMapRef),
      transaction.get(jobRef),
      transaction.get(lockRef),
      transaction.get(existingJobsQuery)
    ]);

    const activeExisting = existingJobsSnap.docs.find((document) => isActiveJob(document.data()));
    if (activeExisting) {
      const active = activeExisting.data() || {};
      transaction.set(requestRef, {
        userId,
        ticketId,
        jobId: activeExisting.id,
        jobStatus: active.status,
        idempotencyKeyHash: hash(idempotencyKey),
        createdAt: new Date().toISOString()
      });
      return { jobId: activeExisting.id, status: active.status, idempotent: true };
    }

    if (lockSnap.exists && isActiveJob(lockSnap.data())) {
      const lock = lockSnap.data() || {};
      transaction.set(requestRef, {
        userId,
        ticketId,
        jobId: lock.jobId,
        jobStatus: lock.status,
        idempotencyKeyHash: hash(idempotencyKey),
        createdAt: new Date().toISOString()
      });
      return { jobId: lock.jobId, status: lock.status, idempotent: true };
    }

    const profile = profileSnap.exists ? profileSnap.data() : null;
    const connector = connectorSnap.exists ? { id: connectorSnap.id, ...connectorSnap.data() } : null;
    const portalMap = portalMapSnap.exists ? { id: portalMapSnap.id, ...portalMapSnap.data() } : null;
    assertConnectorAndPortalMap(connector, portalMap, connectorId, portalMapId);

    const ticketDataSnapshot = buildTicketSnapshot(ticket);
    assertPortalFieldContract(ticketDataSnapshot, connector, portalMap);
    const fiscalProfileSnapshot = buildFiscalProfileSnapshot(profile);
    const existingJob = jobSnap.exists ? jobSnap.data() || {} : null;
    if (existingJob && TERMINAL_SUCCESS_STATUSES.has(existingJob.status)) {
      throw new InvoiceEnqueueError("TICKET_ALREADY_COMPLETED", "Este ticket ya tiene una factura finalizada.", 409, { jobId });
    }

    const now = new Date().toISOString();
    const connectorSnapshot = {
      id: connectorId,
      nombre: valueOrEmpty(connector.nombre || connector.name),
      rfc: valueOrEmpty(connector.rfc),
      portalUrl: valueOrEmpty(connector.portalUrl),
      status: connector.status || null,
      version: connector.version || null
    };
    const portalMapSnapshot = {
      id: portalMapId,
      connectorId,
      status: portalMap.status,
      version: portalMap.version || null,
      requiredFields: portalMap.requiredFields || [],
      stepsJson: portalMap.stepsJson || "[]",
      entryUrl: portalMap.entryUrl || portalMap.url || connectorSnapshot.portalUrl,
      downloadRulesJson: portalMap.downloadRulesJson || null,
      captchaSelectorsJson: portalMap.captchaSelectorsJson || null,
      errorSelectorsJson: portalMap.errorSelectorsJson || null
    };
    const job = {
      ticketId,
      userId,
      status: "pending",
      connectorId,
      portalMapId,
      connectorStatusAtRun: connector.status || null,
      ticketDataSnapshot,
      fiscalProfileSnapshot,
      connectorSnapshot,
      portalMapSnapshot,
      idempotencyKeyHash: hash(idempotencyKey),
      attempts: Number(existingJob?.attempts || 0),
      maxAttempts: Number(existingJob?.maxAttempts || 3),
      currentStepIndex: 0,
      waitingForFields: [],
      canResume: true,
      createdAt: existingJob?.createdAt || now,
      updatedAt: now
    };

    transaction.set(jobRef, job, { merge: false });
    transaction.set(lockRef, { ticketId, jobId, userId, status: "pending", updatedAt: now }, { merge: false });
    transaction.set(outboxRef, { jobId, ticketId, userId, status: "pending", eventType: "invoice_job.enqueue", createdAt: now, updatedAt: now }, { merge: false });
    transaction.set(requestRef, { userId, ticketId, jobId, jobStatus: "pending", idempotencyKeyHash: hash(idempotencyKey), createdAt: now });
    transaction.update(ticketRef, { status: "queued_for_runner", jobId, activeInvoiceJobId: jobId, updatedAt: now });
    return { jobId, status: "pending", idempotent: false };
  });
}

async function submitInvoiceJobCaptcha({ db, userId, jobId, solution, captchaAttemptId = null }) {
  if (!db || typeof db.runTransaction !== "function") throw new InvoiceEnqueueError("DATABASE_UNAVAILABLE", "La cola no esta disponible.", 503);
  if (!userId) throw new InvoiceEnqueueError("UNAUTHENTICATED", "Debes iniciar sesion para enviar el CAPTCHA.", 401);
  if (!validJobId(jobId)) throw new InvoiceEnqueueError("INVALID_JOB_ID", "El job solicitado no es valido.", 400);
  if (typeof solution !== "string" || !solution.trim() || solution.trim().length > 256) {
    throw new InvoiceEnqueueError("INVALID_CAPTCHA_SOLUTION", "El codigo CAPTCHA no es valido.", 422);
  }

  const jobRef = db.collection("invoice_jobs").doc(jobId);
  return db.runTransaction(async (transaction) => {
    const jobSnap = await transaction.get(jobRef);
    if (!jobSnap.exists) throw new InvoiceEnqueueError("JOB_NOT_FOUND", "El proceso de factura no existe.", 404);
    const job = jobSnap.data() || {};
    if (job.userId !== userId) throw new InvoiceEnqueueError("FORBIDDEN", "No tienes acceso a este proceso de factura.", 403);
    if (!new Set(["blocked_by_captcha", "waiting_human_verification", "waiting_user_captcha", "waiting_user_input", "captcha_failed", "captcha_timeout"]).has(job.status)) {
      throw new InvoiceEnqueueError("CAPTCHA_NOT_EXPECTED", "Este proceso no esta esperando un CAPTCHA.", 409);
    }
    if (captchaAttemptId && job.captchaAttemptId && captchaAttemptId !== job.captchaAttemptId) {
      throw new InvoiceEnqueueError("CAPTCHA_ATTEMPT_MISMATCH", "El CAPTCHA ya no corresponde al intento activo.", 409);
    }
    const now = new Date().toISOString();
    transaction.update(jobRef, {
      status: "captcha_submitted",
      captchaSolution: solution.trim(),
      captchaSolutionAt: now,
      captchaAttemptId: captchaAttemptId || job.captchaAttemptId || null,
      updatedAt: now
    });
    return { jobId, status: "captcha_submitted" };
  });
}

module.exports = { enqueueInvoiceJob, submitInvoiceJobCaptcha, InvoiceEnqueueError };
