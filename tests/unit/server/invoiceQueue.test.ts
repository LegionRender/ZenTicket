import { describe, expect, it } from "vitest";

const { enqueueInvoiceJob, submitInvoiceJobCaptcha } = require("../../../shared/backend/invoiceQueue.cjs");

type Stored = Map<string, any>;

function createFakeDb(seed: Record<string, Record<string, any>>) {
  const store: Stored = new Map();
  for (const [collection, records] of Object.entries(seed)) {
    for (const [id, value] of Object.entries(records)) store.set(`${collection}/${id}`, value);
  }

  const ref = (collection: string, id: string) => ({ kind: "ref", collection, id, path: `${collection}/${id}` });
  const snapshot = (target: any) => {
    const value = store.get(target.path);
    return { exists: value !== undefined, id: target.id, data: () => value };
  };
  const collection = (name: string) => ({
    doc: (id: string) => ref(name, id),
    where: (field: string, _operator: string, value: any) => ({
      kind: "query",
      collection: name,
      field,
      value,
      limit: (max: number) => ({ kind: "query", collection: name, field, value, limit: max })
    })
  });

  return {
    collection,
    runTransaction: async (callback: (transaction: any) => Promise<any>) => callback({
      get: async (target: any) => {
        if (target.kind === "query") {
          const docs = [...store.entries()]
            .filter(([path, value]) => path.startsWith(`${target.collection}/`) && value?.[target.field] === target.value)
            .slice(0, target.limit)
            .map(([path, value]) => {
              const id = path.split("/")[1];
              return { exists: true, id, data: () => value };
            });
          return { docs };
        }
        return snapshot(target);
      },
      set: (target: any, value: any, options?: { merge?: boolean }) => {
        store.set(target.path, options?.merge ? { ...(store.get(target.path) || {}), ...value } : value);
      },
      update: (target: any, value: any) => {
        store.set(target.path, { ...(store.get(target.path) || {}), ...value });
      }
    }),
    read: (collectionName: string, id: string) => store.get(`${collectionName}/${id}`),
    collectionValues: (collectionName: string) => [...store.entries()]
      .filter(([path]) => path.startsWith(`${collectionName}/`))
      .map(([, value]) => value)
  };
}

function validSeed(): Record<string, Record<string, any>> {
  return {
    tickets: {
      ticket_1: {
        userId: "user_1",
        connectorId: "merchant_1",
        portalMapId: "map_merchant_1",
        nombreEmisor: "Comercio Real",
        rfcEmisor: "AAA010101AAA",
        total: 125.5,
        portalFields: { billingReference: "REF-REAL-123" }
      }
    },
    fiscalProfiles: {
      user_1: {
        rfc: "XAXX010101000",
        razonSocial: "PERSONA REAL",
        regimenFiscal: "612",
        codigoPostal: "01000",
        usoCFDI: "G03",
        correoElectronico: "persona@example.com"
      }
    },
    connectors: {
      merchant_1: {
        nombre: "Comercio Real",
        rfc: "AAA010101AAA",
        status: "real_validation",
        runnerAvailable: true,
        extractionContract: { requiredPortalFields: [{ key: "portalFields.billingReference", required: true }] }
      }
    },
    portal_maps: {
      map_merchant_1: {
        connectorId: "merchant_1",
        status: "approved",
        isApproved: true,
        stepsJson: "[]"
      }
    }
  };
}

describe("invoice queue transaction", () => {
  it("crea un solo job inmutable y reutiliza la misma llave de idempotencia", async () => {
    const db = createFakeDb(validSeed());
    const input = { db, userId: "user_1", ticketId: "ticket_1", idempotencyKey: "enqueue-key-0001" };

    const first = await enqueueInvoiceJob(input);
    const second = await enqueueInvoiceJob(input);

    expect(first.idempotent).toBe(false);
    expect(second).toEqual({ jobId: first.jobId, status: "pending", idempotent: true });
    expect(db.collectionValues("invoice_jobs")).toHaveLength(1);
    expect(db.read("invoice_jobs", first.jobId)).toMatchObject({
      ticketId: "ticket_1",
      userId: "user_1",
      status: "pending",
      ticketDataSnapshot: { portalFields: { billingReference: "REF-REAL-123" } },
      fiscalProfileSnapshot: { rfc: "XAXX010101000" }
    });
    expect(db.read("tickets", "ticket_1")).toMatchObject({ activeInvoiceJobId: first.jobId, status: "queued_for_runner" });
  });

  it("no crea otro job activo cuando cambia la llave de idempotencia", async () => {
    const db = createFakeDb(validSeed());
    const first = await enqueueInvoiceJob({ db, userId: "user_1", ticketId: "ticket_1", idempotencyKey: "enqueue-key-0001" });
    const second = await enqueueInvoiceJob({ db, userId: "user_1", ticketId: "ticket_1", idempotencyKey: "enqueue-key-0002" });

    expect(second).toEqual({ jobId: first.jobId, status: "pending", idempotent: true });
    expect(db.collectionValues("invoice_jobs")).toHaveLength(1);
  });

  it("rechaza campos requeridos ausentes sin inventar una referencia", async () => {
    const seed = validSeed();
    seed.tickets.ticket_1.portalFields = {};
    const db = createFakeDb(seed);

    await expect(enqueueInvoiceJob({ db, userId: "user_1", ticketId: "ticket_1", idempotencyKey: "enqueue-key-0003" }))
      .rejects.toMatchObject({ code: "MISSING_REQUIRED_FIELDS", status: 422 });
    expect(db.collectionValues("invoice_jobs")).toHaveLength(0);
  });

  it("acepta CAPTCHA solo para el dueño y un estado que lo espera", async () => {
    const seed = validSeed();
    seed.invoice_jobs = {
      job_captcha: {
        userId: "user_1",
        ticketId: "ticket_1",
        status: "waiting_user_captcha",
        captchaAttemptId: "attempt_1"
      }
    };
    const db = createFakeDb(seed);

    await expect(submitInvoiceJobCaptcha({
      db,
      userId: "user_1",
      jobId: "job_captcha",
      solution: "AB12",
      captchaAttemptId: "attempt_1"
    })).resolves.toEqual({ jobId: "job_captcha", status: "captcha_submitted" });
    expect(db.read("invoice_jobs", "job_captcha")).toMatchObject({ status: "captcha_submitted", captchaSolution: "AB12" });
  });
});
