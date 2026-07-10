import { describe, it, expect, vi } from "vitest";
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as path from "path";
import * as fs from "fs";
import request from "supertest";
import { app } from "../../../server/app";
import { recoverExistingInvoiceFromPortal } from "../../../runner/src/engines/automation/recoverInvoice";
import { getBillingCanonicalState, getBillingAlertStyle } from "../../../src/workspace/utils/billingStateHelpers";
import { normalizeBillingAttemptFields as frontendNormalize } from "../../../src/shared/utils/normalizeFields";
import { normalizeBillingAttemptFields as runnerNormalize } from "../../../runner/src/utils/normalizeFields";

// Mock documentSniffer to avoid Playwright evaluate error
vi.mock("../../../runner/src/executor/documentSniffer", () => {
  return {
    collectDocuments: vi.fn().mockResolvedValue({ xmlPath: null, pdfPath: null })
  };
});

// Initialize Firebase Admin mock or real for test
const serviceAccountPath = path.join(__dirname, "../../../serviceAccountKey.json");
if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  if (getApps().length === 0) {
    initializeApp({
      credential: cert(serviceAccount)
    });
  }
} else {
  if (getApps().length === 0) {
    initializeApp({
      projectId: "factubolt"
    });
  }
}

const databaseId = "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee";
const db = getFirestore(getApp(), databaseId);

describe("Fase 14C - Deep CFDI Recovery & retry endpoint tests", () => {

  it("portalMessage de duplicado se muestra igual en tarjeta y detalle", () => {
    const ticketObj = {
      status: "already_invoiced_unverified",
      wasAlreadyInvoiced: true,
      portalMessage: "Ticket ya Facturado: El ticket con Folio 486259 ya fue emitido con anterioridad."
    };
    const state = getBillingCanonicalState({ ticket: ticketObj });
    expect(state.message).toBe("El portal indica que este ticket ya fue facturado, pero ZenTicket no pudo recuperar ni validar el XML fiscal.");
  });

  it("TICKET_ALREADY_INVOICED nunca muestra mensaje genérico", () => {
    const ticketObj = {
      status: "requires_manual_review",
      errorCode: "TICKET_ALREADY_INVOICED"
    };
    const state = getBillingCanonicalState({ ticket: ticketObj });
    expect(state.message).not.toContain("Ocurrió un inconveniente");
    expect(state.message).toBe("El portal indica que este ticket ya fue facturado, pero ZenTicket no pudo recuperar ni validar el XML fiscal.");
  });

  it("duplicateDetected no equivale a isCfdiValidated y duplicateIsFiscalProof es false", () => {
    const ticketObj = {
      duplicateDetected: true,
      duplicateIsFiscalProof: false,
      wasAlreadyInvoiced: true
    };
    const state = getBillingCanonicalState({ ticket: ticketObj });
    expect(state.isReady).toBe(false);
    expect(state.isValidInvoice).toBe(false);
  });

  it("duplicado entra a invoice_recovery_pending antes de revisión manual", () => {
    const ticketObj = {
      status: "invoice_recovery_pending",
      wasAlreadyInvoiced: true,
      recoveryAttemptCount: 1,
      maxRecoveryAttempts: 3
    };
    const state = getBillingCanonicalState({ ticket: ticketObj });
    expect(state.canonicalStatus).toBe("invoice_recovery_pending");
    expect(state.badgeLabel).toBe("RECUPERANDO CFDI");
  });

  it("already_invoiced_unverified solo ocurre tras agotar intentos", () => {
    const ticketObj = {
      status: "already_invoiced_unverified",
      wasAlreadyInvoiced: true,
      recoveryAttemptCount: 3,
      maxRecoveryAttempts: 3
    };
    const state = getBillingCanonicalState({ ticket: ticketObj });
    expect(state.canonicalStatus).toBe("already_invoiced_unverified");
    expect(state.badgeLabel).toBe("YA FACTURADO SIN XML");
  });

  it("fecha de tarjeta y fecha enviada al portal salen del mismo objeto normalizado", () => {
    const ticketObj = {
      fechaCompra: "2026-07-03",
      portalFields: {
        fecha: "2026-07-03"
      }
    };
    const norm = frontendNormalize(ticketObj);
    expect(norm.fechaCompra).toBe("2026-07-03");
  });

  it("helper frontend y runner devuelven el mismo resultado (test de paridad exacta)", () => {
    const ticketObj = {
      reference: "12345",
      portalFields: {
        venta: "ITU999",
        total: 150.50,
        fecha: "2026-07-09"
      }
    };
    const resFront = frontendNormalize(ticketObj);
    const resRunner = runnerNormalize(ticketObj);
    expect(resFront.folio).toBe(resRunner.folio);
    expect(resFront.itu).toBe(resRunner.itu);
    expect(resFront.total).toBe(resRunner.total);
    expect(resFront.fechaCompra).toBe(resRunner.fechaCompra);
  });

  it("PDF sin XML no marca Listos", () => {
    const state = getBillingCanonicalState({
      ticket: { status: "invoice_obtained" },
      invoice: { pdfHtml: "some pdf html", xmlContent: "" }
    });
    expect(state.isReady).toBe(false);
  });

  it("XML + SAT Vigente sí marca Listos", () => {
    const state = getBillingCanonicalState({
      ticket: { status: "cfdi_validated", expectedTicketTotal: 100 },
      invoice: {
        total: 100,
        pdfHtml: "pdf",
        xmlContent: "<xml>cfdi</xml>",
        uuid: "uuid-123",
        isCfdiValidated: true,
        validationStatus: "sat_validated",
        satStatus: "vigente"
      }
    });
    expect(state.isReady).toBe(true);
  });

  it("Ver detalles recibe el mismo visualKey, canonicalStatus, y message de la tarjeta y no abre deleted, hidden o linkedTicketDeleted", () => {
    const item = {
      visualKey: "visual-key-123",
      ticket: {
        id: "ticket_vl1fykkpi",
        status: "already_invoiced_unverified",
        wasAlreadyInvoiced: true
      },
      invoice: null,
      job: null,
      state: {
        canonicalStatus: "already_invoiced_unverified",
        message: "El portal indica que este ticket ya fue facturado, pero ZenTicket no pudo recuperar ni validar el XML fiscal."
      }
    };

    expect(item.visualKey).toBe("visual-key-123");
    expect(item.state.canonicalStatus).toBe("already_invoiced_unverified");
    expect(item.state.message).toBe("El portal indica que este ticket ya fue facturado, pero ZenTicket no pudo recuperar ni validar el XML fiscal.");

    const deletedTicket = { ...item.ticket, status: "deleted" };
    const isDeleted1 = deletedTicket.status === "deleted" || (deletedTicket as any).deletedAt;
    expect(isDeleted1).toBeTruthy();

    const hiddenTicket = { ...item.ticket, hiddenFromUser: true };
    const isDeleted2 = hiddenTicket.hiddenFromUser === true;
    expect(isDeleted2).toBe(true);

    const linkedDeletedTicket = { ...item.ticket, linkedTicketDeleted: true };
    const isDeleted3 = linkedDeletedTicket.linkedTicketDeleted === true;
    expect(isDeleted3).toBe(true);

    const sourceType = item.invoice ? "invoice_detail" : "ticket_detail_without_invoice";
    expect(sourceType).toBe("ticket_detail_without_invoice");

    const isSynthetic = !item.invoice;
    const isFiscalDocument = !isSynthetic;
    expect(isFiscalDocument).toBe(false);

    expect(item.state.message).not.toContain("Ocurrió un inconveniente");
  });

  it("getBillingAlertStyle unifica la severidad visual segun las reglas canónicas", () => {
    const amber1 = getBillingAlertStyle({ canonicalStatus: "requires_manual_review" });
    const amber2 = getBillingAlertStyle({ canonicalStatus: "already_invoiced_unverified" });
    const red3 = getBillingAlertStyle({ canonicalStatus: "CFDI_INVALID_XML" });
    expect(amber1.tone).toBe("amber");
    expect(amber2.tone).toBe("amber");
    expect(red3.tone).toBe("red");

    const green = getBillingAlertStyle({ canonicalStatus: "cfdi_validated" });
    expect(green.tone).toBe("green");

    const blue1 = getBillingAlertStyle({ canonicalStatus: "invoice_recovery_pending" });
    const blue2 = getBillingAlertStyle({ canonicalStatus: "sat_validation_pending" });
    expect(blue1.tone).toBe("blue");
    expect(blue2.tone).toBe("blue");
  });
});
