import { describe, it, expect } from "vitest";
import { getTicketTotal, getDetailedReasonMsg, getTicketVisualState, getInvoiceVisualState } from "../../../src/workspace/utils/ticketHelpers";
import { getBillingCanonicalState, getBillingVisualKey, dedupeBillingItems, resolveRelatedBillingDocs, normalizeSatValidationState, buildBillingDashboardStats } from "../../../src/workspace/utils/billingStateHelpers";
import { getCustomerBillingState } from "../../../src/workspace/utils/customerBillingState";

describe("Frontend Ticket Display and Logic Helpers", () => {
  describe("getTicketTotal helper", () => {
    it("should resolve expectedTicketTotal first", () => {
      const ticket = {
        expectedTicketTotal: 455,
        portalFields: { total: 100 },
        ticketData: { total: 200 },
        amountPaid: 300,
        total: 400
      };
      expect(getTicketTotal(ticket)).toBe(455);
    });

    it("should resolve portalFields.total second", () => {
      const ticket = {
        expectedTicketTotal: 0,
        portalFields: { total: 455 },
        ticketData: { total: 200 },
        amountPaid: 300,
        total: 400
      };
      expect(getTicketTotal(ticket)).toBe(455);
    });

    it("should resolve ticketData.total third", () => {
      const ticket = {
        expectedTicketTotal: null,
        portalFields: null,
        ticketData: { total: 455 },
        amountPaid: 300,
        total: 400
      };
      expect(getTicketTotal(ticket)).toBe(455);
    });

    it("should resolve amountPaid fourth", () => {
      const ticket = {
        expectedTicketTotal: 0,
        portalFields: { total: 0 },
        ticketData: { total: 0 },
        amountPaid: 455,
        total: 400
      };
      expect(getTicketTotal(ticket)).toBe(455);
    });

    it("should resolve total as fallback", () => {
      const ticket = {
        total: 455
      };
      expect(getTicketTotal(ticket)).toBe(455);
    });

    it("should return 0 when no total fields are present", () => {
      expect(getTicketTotal({})).toBe(0);
    });
  });

  describe("getDetailedReasonMsg helper", () => {
    it("should show already invoiced warning when reviewReasonCode is TICKET_ALREADY_INVOICED", () => {
      const ticket = {
        reviewReasonCode: "TICKET_ALREADY_INVOICED",
        folio: "A10497000022055681"
      };
      const msg = getDetailedReasonMsg(ticket);
      expect(msg).toContain("ya fue emitido anteriormente.");
      expect(msg).toContain("A10497000022055681");
    });

    it("should show already invoiced warning when wasAlreadyInvoiced flag is true", () => {
      const ticket = {
        wasAlreadyInvoiced: true,
        billingReference: "A10497000022055681"
      };
      const msg = getDetailedReasonMsg(ticket);
      expect(msg).toContain("ya fue emitido anteriormente.");
      expect(msg).toContain("A10497000022055681");
    });

    it("should show duplicate warning when status is duplicate", () => {
      const ticket = {
        status: "duplicate",
        folio: "DUP123"
      };
      const msg = getDetailedReasonMsg(ticket);
      expect(msg).toContain("es un duplicado");
      expect(msg).toContain("DUP123");
    });

    it("should show blocked warning when status is failed_blocking", () => {
      const ticket = {
        status: "failed_blocking",
        folio: "BLOCKED123"
      };
      const msg = getDetailedReasonMsg(ticket);
      expect(msg).toContain("está bloqueado");
      expect(msg).toContain("BLOCKED123");
    });

    it("should show sanitized and safe messages without exposing technical stack traces", () => {
      const ticket = {
        reviewError: {
          runnerErrorCode: "TICKET_ALREADY_INVOICED",
          reviewReasonCode: "TICKET_ALREADY_INVOICED"
        }
      };
      const msg = getDetailedReasonMsg(ticket);
      expect(msg).toBe("el folio S/D ya fue emitido anteriormente.");
      expect(msg).not.toContain("stacktrace");
      expect(msg).not.toContain("playwright");
    });
  });

  describe("getTicketVisualState helper", () => {
    it("should map wasAlreadyInvoiced = true to YA FACTURADO and isActive = false", () => {
      const ticket = { wasAlreadyInvoiced: true, status: "processing" };
      const state = getTicketVisualState(ticket);
      expect(state.visualStatus).toBe("already_invoiced");
      expect(state.badgeLabel).toBe("YA FACTURADO");
      expect(state.isActive).toBe(false);
      expect(state.requiresAttention).toBe(true);
    });

    it("should map reviewReasonCode = TICKET_ALREADY_INVOICED to YA FACTURADO and isActive = false", () => {
      const ticket = { reviewReasonCode: "TICKET_ALREADY_INVOICED", status: "processing" };
      const state = getTicketVisualState(ticket);
      expect(state.visualStatus).toBe("already_invoiced");
      expect(state.badgeLabel).toBe("YA FACTURADO");
      expect(state.isActive).toBe(false);
      expect(state.requiresAttention).toBe(true);
    });

    it("should map reviewError.errorCode = TICKET_ALREADY_INVOICED to YA FACTURADO and isActive = false", () => {
      const ticket = { reviewError: { errorCode: "TICKET_ALREADY_INVOICED" }, status: "processing" };
      const state = getTicketVisualState(ticket);
      expect(state.visualStatus).toBe("already_invoiced");
      expect(state.badgeLabel).toBe("YA FACTURADO");
      expect(state.isActive).toBe(false);
      expect(state.requiresAttention).toBe(true);
    });

    it("should map status = runner_processing but wasAlreadyInvoiced = true to YA FACTURADO (not AUTOMATIZANDO)", () => {
      const ticket = { status: "runner_processing", wasAlreadyInvoiced: true };
      const state = getTicketVisualState(ticket);
      expect(state.visualStatus).toBe("already_invoiced");
      expect(state.badgeLabel).toBe("YA FACTURADO");
      expect(state.isActive).toBe(false);
      expect(state.requiresAttention).toBe(true);
    });

    it("should map status = failed_blocking to BLOQUEADO and isActive = false", () => {
      const ticket = { status: "failed_blocking" };
      const state = getTicketVisualState(ticket);
      expect(state.visualStatus).toBe("failed_blocking");
      expect(state.badgeLabel).toBe("BLOQUEADO");
      expect(state.isActive).toBe(false);
      expect(state.requiresAttention).toBe(true);
    });

    it("should map status = requires_manual_review to REVISIÓN MANUAL and isActive = false", () => {
      const ticket = { status: "requires_manual_review" };
      const state = getTicketVisualState(ticket);
      expect(state.visualStatus).toBe("requires_manual_review");
      expect(state.badgeLabel).toBe("REVISIÓN MANUAL");
      expect(state.isActive).toBe(false);
      expect(state.requiresAttention).toBe(true);
    });

    it("should map status = waiting_user_captcha to CAPTCHA REQUERIDO and isActive = true", () => {
      const ticket = { status: "waiting_user_captcha" };
      const state = getTicketVisualState(ticket);
      expect(state.visualStatus).toBe("waiting_user_captcha");
      expect(state.badgeLabel).toBe("CAPTCHA REQUERIDO");
      expect(state.isActive).toBe(true);
      expect(state.requiresAttention).toBe(true);
    });

    it("should map status = runner_processing without error to AUTOMATIZANDO and isActive = true", () => {
      const ticket = { status: "runner_processing" };
      const state = getTicketVisualState(ticket);
      expect(state.visualStatus).toBe("runner_processing");
      expect(state.badgeLabel).toBe("AUTOMATIZANDO");
      expect(state.isActive).toBe(true);
      expect(state.requiresAttention).toBe(false);
    });

    it("should filter activeCount using isActive correctly", () => {
      const list = [
        { status: "runner_processing" }, // isActive: true
        { status: "queued_for_runner" },  // isActive: true
        { status: "requires_manual_review" }, // isActive: false
        { status: "runner_processing", wasAlreadyInvoiced: true } // isActive: false
      ];
      const activeCount = list.filter(t => getTicketVisualState(t).isActive).length;
      expect(activeCount).toBe(2);
    });
  });

  describe("getInvoiceVisualState helper", () => {
    it("should map invoice total 0 + ticket expected 455 to CFDI INVÁLIDO and disable downloads", () => {
      const invoice = { total: 0, xmlContent: "<xml></xml>", pdfHtml: "<html></html>" };
      const ticket = { expectedTicketTotal: 455 };
      const state = getInvoiceVisualState(invoice, ticket);
      expect(state.visualStatus).toBe("invalid_total");
      expect(state.badgeLabel).toBe("CFDI INVÁLIDO");
      expect(state.canViewPdf).toBe(false);
      expect(state.canDownloadXml).toBe(false);
      expect(state.requiresAttention).toBe(true);
      expect(state.isValidInvoice).toBe(false);
    });

    it("should map invoice with TICKET_ALREADY_INVOICED error to YA FACTURADO, requires attention", () => {
      const invoice = { total: 100, errorCode: "TICKET_ALREADY_INVOICED", xmlContent: "<xml></xml>", pdfHtml: "<html></html>" };
      const state = getInvoiceVisualState(invoice);
      expect(state.visualStatus).toBe("already_invoiced");
      expect(state.badgeLabel).toBe("YA FACTURADO");
      expect(state.requiresAttention).toBe(true);
      expect(state.canViewPdf).toBe(false); // not validated yet
      expect(state.canDownloadXml).toBe(false);
    });

    it("should map invoice without isCfdiValidated to REVISIÓN MANUAL, no download", () => {
      const invoice = { total: 100, isCfdiValidated: false, xmlContent: "<xml></xml>", pdfHtml: "<html></html>" };
      const state = getInvoiceVisualState(invoice);
      expect(state.visualStatus).toBe("requires_review");
      expect(state.badgeLabel).toBe("REVISIÓN MANUAL");
      expect(state.isValidInvoice).toBe(false);
      expect(state.canViewPdf).toBe(true); // present physically but not validated, user can inspect
      expect(state.canDownloadXml).toBe(true);
    });

    it("should allow PDF/XML if validly validated", () => {
      const invoice = { total: 100, isCfdiValidated: true, xmlContent: "<xml></xml>", pdfHtml: "<html></html>" };
      const state = getInvoiceVisualState(invoice);
      expect(state.visualStatus).toBe("valid");
      expect(state.badgeLabel).toBe("FACTURADO");
      expect(state.isValidInvoice).toBe(true);
      expect(state.canViewPdf).toBe(true);
      expect(state.canDownloadXml).toBe(true);
    });

    it("should map invoice with CFDI_TOTAL_MISMATCH to TOTAL INCORRECTO and disable downloads", () => {
      const invoice = { total: 100, errorCode: "CFDI_TOTAL_MISMATCH", xmlContent: "<xml></xml>", pdfHtml: "<html></html>" };
      const state = getInvoiceVisualState(invoice);
      expect(state.visualStatus).toBe("total_mismatch");
      expect(state.badgeLabel).toBe("TOTAL INCORRECTO");
      expect(state.canViewPdf).toBe(false);
      expect(state.canDownloadXml).toBe(false);
      expect(state.requiresAttention).toBe(true);
    });

    it("should map invoice with CFDI_RFC_RECEPTOR_MISMATCH to RFC INCORRECTO and disable downloads", () => {
      const invoice = { total: 100, errorCode: "CFDI_RFC_RECEPTOR_MISMATCH", xmlContent: "<xml></xml>", pdfHtml: "<html></html>" };
      const state = getInvoiceVisualState(invoice);
      expect(state.visualStatus).toBe("rfc_mismatch");
      expect(state.badgeLabel).toBe("RFC INCORRECTO");
      expect(state.canViewPdf).toBe(false);
      expect(state.canDownloadXml).toBe(false);
      expect(state.requiresAttention).toBe(true);
    });

    it("should inherit blocked state from related ticket", () => {
      const invoice = { total: 100, isCfdiValidated: false };
      const ticket = { status: "failed_blocking", errorMsg: "El RFC de receptor no coincide con la base de datos." };
      const state = getInvoiceVisualState(invoice, ticket);
      expect(state.visualStatus).toBe("rfc_mismatch");
      expect(state.badgeLabel).toBe("RFC INCORRECTO");
      expect(state.canViewPdf).toBe(false);
      expect(state.canDownloadXml).toBe(false);
    });

    it("should set displays and checks correctly for ticket TICKET_ALREADY_INVOICED", () => {
      const invoice = { total: 100 };
      const ticket = { wasAlreadyInvoiced: true };
      const state = getInvoiceVisualState(invoice, ticket);
      expect(state.visualStatus).toBe("already_invoiced");
      expect(state.badgeLabel).toBe("YA FACTURADO");
      expect(state.requiresAttention).toBe(true);
    });
  });

  describe("getBillingCanonicalState helper", () => {
    it("should map validated invoice -> shouldAppearInReady true", () => {
      const invoice = { isCfdiValidated: true, satValidated: true, xmlContent: "<xml></xml>", folioFiscal: "UUID-1", total: 100 };
      const state = getBillingCanonicalState({ invoice });
      expect(state.shouldAppearInReady).toBe(true);
      expect(state.canonicalStatus).toBe("cfdi_validated");
    });

    it("should map invoice total 0 + ticket portalFields.totalAmount 455 -> shouldAppearInReady false", () => {
      const invoice = { total: 0, isCfdiValidated: true, xmlContent: "<xml></xml>", folioFiscal: "UUID-1" };
      const ticket = { portalFields: { totalAmount: 455 } };
      const state = getBillingCanonicalState({ invoice, ticket });
      expect(state.shouldAppearInReady).toBe(false);
      expect(state.canonicalStatus).toBe("cfdi_invalid");
      expect(state.displayTotal).toBe(455);
    });

    it("should map invoice without XML -> shouldAppearInReady false", () => {
      const invoice = { isCfdiValidated: true, xmlContent: "", folioFiscal: "UUID-1", total: 100 };
      const state = getBillingCanonicalState({ invoice });
      expect(state.shouldAppearInReady).toBe(false);
    });

    it("should map invoice without isCfdiValidated -> shouldAppearInReady false", () => {
      const invoice = { isCfdiValidated: false, xmlContent: "<xml></xml>", folioFiscal: "UUID-1", total: 100 };
      const state = getBillingCanonicalState({ invoice });
      expect(state.shouldAppearInReady).toBe(false);
    });

    it("should map ticket TICKET_ALREADY_INVOICED without XML -> already_invoiced_unverified", () => {
      const ticket = { errorCode: "TICKET_ALREADY_INVOICED" };
      const state = getBillingCanonicalState({ ticket });
      expect(state.canonicalStatus).toBe("already_invoiced_unverified");
      expect(state.shouldAppearInReady).toBe(false);
    });

    it("should map ticket invoice_obtained without invoice real -> invoice_obtained_unverified", () => {
      const ticket = { status: "invoice_obtained" };
      const state = getBillingCanonicalState({ ticket });
      expect(state.canonicalStatus).toBe("invoice_obtained_unverified");
      expect(state.shouldAppearInReady).toBe(false);
    });

    it("should map fallback synthetic invoice -> shouldAppearInReady false", () => {
      const invoice = { synthetic: true, isCfdiValidated: false, xmlContent: "" };
      const state = getBillingCanonicalState({ invoice });
      expect(state.shouldAppearInReady).toBe(false);
    });

    it("should map ticket runner_processing without errors -> active_processing", () => {
      const ticket = { status: "runner_processing" };
      const state = getBillingCanonicalState({ ticket });
      expect(state.canonicalStatus).toBe("active_processing");
      expect(state.shouldAppearInProcess).toBe(true);
    });

    it("should map waiting_user_captcha -> waiting_user_captcha", () => {
      const ticket = { status: "waiting_user_captcha" };
      const state = getBillingCanonicalState({ ticket });
      expect(state.canonicalStatus).toBe("waiting_user_captcha");
      expect(state.shouldAppearInProcess).toBe(true);
    });
  });

  describe("getBillingVisualKey helper", () => {
    it("should return the same visual key for related ticket, invoice, and job", () => {
      const ticket = { id: "ticket_123", invoiceId: "UUID-ABC" };
      const invoice = { id: "inv_456", ticketId: "ticket_123", folioFiscal: "UUID-ABC" };
      const job = { ticketId: "ticket_123" };

      const keyFromTicket = getBillingVisualKey({ ticket });
      const keyFromInvoice = getBillingVisualKey({ invoice });
      const keyFromJob = getBillingVisualKey({ job });

      // Because ticket.id is ticket_123, keyFromTicket is TICKET_123
      // Because invoice.ticketId is ticket_123, keyFromInvoice is TICKET_123
      // Because job.ticketId is ticket_123, keyFromJob is TICKET_123
      expect(keyFromTicket).toBe("TICKET_123");
      expect(keyFromInvoice).toBe("TICKET_123");
      expect(keyFromJob).toBe("TICKET_123");
    });

    it("should clean prefixes and normalise casing/spaces", () => {
      const ticket = { reference: "Ticket # A104-9700" };
      expect(getBillingVisualKey({ ticket })).toBe("A104-9700");
    });
  });

  describe("dedupeBillingItems helper", () => {
    it("should deduplicate and conserve real ticket over synthetic invoice", () => {
      const item1 = { ticket: { id: "ticket_123", reference: "REF1", status: "completed" } };
      const item2 = { invoice: { id: "inv-fallback-ticket_123", ticketId: "ticket_123", synthetic: true } };

      const deduped = dedupeBillingItems([item1, item2]);
      expect(deduped.length).toBe(1);
      expect(deduped[0].ticket.id).toBe("ticket_123");
      expect(deduped[0].invoice.id).toBe("inv-fallback-ticket_123"); // Merged invoice!
    });

    it("should conserve real ticket over fallback S/D", () => {
      const item1 = { ticket: { id: "ticket_123", reference: "REF1" } };
      const item2 = { ticket: { id: "syn-ticket_123", reference: "S/D" } };

      const deduped = dedupeBillingItems([item1, item2]);
      expect(deduped.length).toBe(1);
      expect(deduped[0].ticket.id).toBe("ticket_123");
    });

    it("should conserve real invoice over synthetic invoice", () => {
      const item1 = { invoice: { id: "inv_real_123", folioFiscal: "UUID-1", synthetic: false } };
      const item2 = { invoice: { id: "inv-fallback-ticket_123", folioFiscal: "UUID-1", synthetic: true } };

      const deduped = dedupeBillingItems([item1, item2]);
      expect(deduped.length).toBe(1);
      expect(deduped[0].invoice.id).toBe("inv_real_123");
    });
  });

  describe("Soft-delete and list exclusions", () => {
    it("should exclude ticket with hiddenFromUser, deletedAt, or status deleted", () => {
      const tickets = [
        { id: "t1", status: "completed" },
        { id: "t2", hiddenFromUser: true },
        { id: "t3", deletedAt: "2026-07-08T22:00:00Z" },
        { id: "t4", status: "deleted" }
      ];

      const activeTickets = tickets.filter(t => 
        t.hiddenFromUser !== true &&
        !t.deletedAt &&
        t.status !== "deleted"
      );

      expect(activeTickets.length).toBe(1);
      expect(activeTickets[0].id).toBe("t1");
    });

    it("should exclude invoice with hiddenFromUser or linkedTicketDeleted", () => {
      const invoices = [
        { id: "i1" },
        { id: "i2", hiddenFromUser: true },
        { id: "i3", linkedTicketDeleted: true }
      ];

      const activeInvoices = invoices.filter(inv =>
        inv.hiddenFromUser !== true &&
        inv.linkedTicketDeleted !== true
      );

      expect(activeInvoices.length).toBe(1);
      expect(activeInvoices[0].id).toBe("i1");
    });

    it("should not mark synthetic invoice as ready", () => {
      const invoice = { synthetic: true, isCfdiValidated: false };
      const state = getBillingCanonicalState({ invoice });
      expect(state.shouldAppearInReady).toBe(false);
    });
  });

  describe("Fase 12G — SAT validation rules", () => {
    it("should mark CFDI with SAT Vigente as ready", () => {
      const ticket = { status: "cfdi_validated", rfcReceptor: "CABR8503221X6" };
      const invoice = {
        isCfdiValidated: true,
        satValidated: true,
        satStatus: "Vigente",
        xmlContent: "<cfdi:Comprobante Total=\"100.00\"><cfdi:Emisor Rfc=\"AAA010101AAA\"/><cfdi:Receptor Rfc=\"CABR8503221X6\"/><tfd:TimbreFiscalDigital UUID=\"123\" FechaTimbrado=\"2023\" SelloCFD=\"S1\" SelloSAT=\"S2\" NoCertificadoSAT=\"N1\"/></cfdi:Comprobante>",
        folioFiscal: "UUID-1",
        rfcReceptor: "CABR8503221X6",
        total: 100.00,
        pdfHtml: "<html></html>"
      };
      const state = getBillingCanonicalState({ ticket, invoice });
      expect(state.shouldAppearInReady).toBe(true);
      expect(state.isValidInvoice).toBe(true);
      expect(state.canViewPdf).toBe(true);
      expect(state.canDownloadXml).toBe(true);
    });

    it("should mark CFDI no localizado as not ready", () => {
      const ticket = { status: "cfdi_validated", rfcReceptor: "CABR8503221X6" };
      const invoice = {
        isCfdiValidated: true,
        satValidated: false,
        satStatus: "No Encontrado",
        xmlContent: "<cfdi:Comprobante Total=\"100.00\"><cfdi:Emisor Rfc=\"AAA010101AAA\"/><cfdi:Receptor Rfc=\"CABR8503221X6\"/><tfd:TimbreFiscalDigital UUID=\"123\" FechaTimbrado=\"2023\" SelloCFD=\"S1\" SelloSAT=\"S2\" NoCertificadoSAT=\"N1\"/></cfdi:Comprobante>",
        folioFiscal: "UUID-1",
        rfcReceptor: "CABR8503221X6",
        total: 100.00
      };
      const state = getBillingCanonicalState({ ticket, invoice });
      expect(state.shouldAppearInReady).toBe(false);
    });

    it("should mark CFDI no localizado with pending retries as VALIDANDO SAT", () => {
      const ticket = { status: "cfdi_validated", rfcReceptor: "CABR8503221X6", satAttemptCount: 1, nextSatValidationAt: "2026-07-09T00:00:00Z" };
      const invoice = {
        isCfdiValidated: true,
        satValidated: false,
        satStatus: "No Encontrado",
        xmlContent: "<cfdi:Comprobante Total=\"100.00\"><cfdi:Emisor Rfc=\"AAA010101AAA\"/><cfdi:Receptor Rfc=\"CABR8503221X6\"/><tfd:TimbreFiscalDigital UUID=\"123\" FechaTimbrado=\"2023\" SelloCFD=\"S1\" SelloSAT=\"S2\" NoCertificadoSAT=\"N1\"/></cfdi:Comprobante>",
        folioFiscal: "UUID-1",
        rfcReceptor: "CABR8503221X6",
        total: 100.00
      };
      const state = getBillingCanonicalState({ ticket, invoice });
      expect(state.shouldAppearInReady).toBe(false);
      expect(state.canonicalStatus).toBe("sat_validation_pending");
      expect(state.badgeLabel).toBe("VALIDANDO SAT");
      expect(state.shouldAppearInProcess).toBe(true);
      expect(state.canViewPdf).toBe(false);
      expect(state.canDownloadXml).toBe(false);
    });

    it("should mark CFDI no localizado definitive as CFDI NO LOCALIZADO", () => {
      const ticket = { status: "cfdi_validated", rfcReceptor: "CABR8503221X6", satAttemptCount: 3 };
      const invoice = {
        isCfdiValidated: true,
        satValidated: false,
        satStatus: "No Encontrado",
        xmlContent: "<cfdi:Comprobante Total=\"100.00\"><cfdi:Emisor Rfc=\"AAA010101AAA\"/><cfdi:Receptor Rfc=\"CABR8503221X6\"/><tfd:TimbreFiscalDigital UUID=\"123\" FechaTimbrado=\"2023\" SelloCFD=\"S1\" SelloSAT=\"S2\" NoCertificadoSAT=\"N1\"/></cfdi:Comprobante>",
        folioFiscal: "UUID-1",
        rfcReceptor: "CABR8503221X6",
        total: 100.00
      };
      const state = getBillingCanonicalState({ ticket, invoice });
      expect(state.shouldAppearInReady).toBe(false);
      expect(state.canonicalStatus).toBe("cfdi_not_found_in_sat");
      expect(state.badgeLabel).toBe("CFDI NO LOCALIZADO");
      expect(state.shouldAppearInAttention).toBe(true);
      expect(state.requiresManualReview).toBe(true);
      expect(state.canViewPdf).toBe(false);
      expect(state.canDownloadXml).toBe(false);
    });

    it("should mark recipient RFC mismatch as RFC INCORRECTO", () => {
      const ticket = { status: "cfdi_validated", rfcReceptor: "CABR8503221X6" };
      const invoice = {
        isCfdiValidated: true,
        satValidated: true,
        satStatus: "Vigente",
        xmlContent: "<cfdi:Comprobante Total=\"100.00\"><cfdi:Emisor Rfc=\"AAA010101AAA\"/><cfdi:Receptor Rfc=\"JICM8501017B0\"/><tfd:TimbreFiscalDigital UUID=\"123\" FechaTimbrado=\"2023\" SelloCFD=\"S1\" SelloSAT=\"S2\" NoCertificadoSAT=\"N1\"/></cfdi:Comprobante>",
        folioFiscal: "UUID-1",
        rfcReceptor: "JICM8501017B0",
        total: 100.00
      };
      const state = getBillingCanonicalState({ ticket, invoice });
      expect(state.shouldAppearInReady).toBe(false);
      expect(state.canonicalStatus).toBe("cfdi_rfc_mismatch");
      expect(state.badgeLabel).toBe("RFC INCORRECTO");
      expect(state.shouldAppearInAttention).toBe(true);
      expect(state.requiresManualReview).toBe(true);
      expect(state.canViewPdf).toBe(false);
      expect(state.canDownloadXml).toBe(false);
    });

    it("should not mark XML with UUID but without satValidated as ready", () => {
      const ticket = { status: "cfdi_validated" };
      const invoice = {
        isCfdiValidated: true,
        xmlContent: "<cfdi:Comprobante Total=\"100.00\"><cfdi:Emisor Rfc=\"AAA010101AAA\"/><cfdi:Receptor Rfc=\"CABR8503221X6\"/><tfd:TimbreFiscalDigital UUID=\"123\" FechaTimbrado=\"2023\" SelloCFD=\"S1\" SelloSAT=\"S2\" NoCertificadoSAT=\"N1\"/></cfdi:Comprobante>",
        folioFiscal: "UUID-1",
        total: 100.00
      };
      const state = getBillingCanonicalState({ ticket, invoice });
      expect(state.shouldAppearInReady).toBe(false);
    });

    it("should not mark succeeded job with satValidated false as ready", () => {
      const ticket = { status: "cfdi_validated" };
      const invoice = {
        isCfdiValidated: true,
        xmlContent: "<cfdi:Comprobante Total=\"100.00\"><cfdi:Emisor Rfc=\"AAA010101AAA\"/><cfdi:Receptor Rfc=\"CABR8503221X6\"/><tfd:TimbreFiscalDigital UUID=\"123\" FechaTimbrado=\"2023\" SelloCFD=\"S1\" SelloSAT=\"S2\" NoCertificadoSAT=\"N1\"/></cfdi:Comprobante>",
        folioFiscal: "UUID-1",
        total: 100.00
      };
      const job = { status: "succeeded", satValidated: false };
      const state = getBillingCanonicalState({ ticket, invoice, job });
      expect(state.shouldAppearInReady).toBe(false);
    });

    it("should not mark invoice_obtained without isCfdiValidated as ready", () => {
      const ticket = { status: "invoice_obtained" };
      const invoice = {
        isCfdiValidated: false,
        xmlContent: "<cfdi:Comprobante Total=\"100.00\"><cfdi:Emisor Rfc=\"AAA010101AAA\"/><cfdi:Receptor Rfc=\"CABR8503221X6\"/><tfd:TimbreFiscalDigital UUID=\"123\" FechaTimbrado=\"2023\" SelloCFD=\"S1\" SelloSAT=\"S2\" NoCertificadoSAT=\"N1\"/></cfdi:Comprobante>",
        folioFiscal: "UUID-1",
        total: 100.00
      };
      const state = getBillingCanonicalState({ ticket, invoice });
      expect(state.shouldAppearInReady).toBe(false);
    });

    it("should not mark synthetic invoice as ready", () => {
      const ticket = { status: "cfdi_validated" };
      const invoice = {
        isCfdiValidated: true,
        satValidated: true,
        satStatus: "Vigente",
        xmlContent: "<cfdi:Comprobante Total=\"100.00\"><cfdi:Emisor Rfc=\"AAA010101AAA\"/><cfdi:Receptor Rfc=\"CABR8503221X6\"/><tfd:TimbreFiscalDigital UUID=\"123\" FechaTimbrado=\"2023\" SelloCFD=\"S1\" SelloSAT=\"S2\" NoCertificadoSAT=\"N1\"/></cfdi:Comprobante>",
        folioFiscal: "UUID-1",
        total: 100.00,
        synthetic: true
      };
      const state = getBillingCanonicalState({ ticket, invoice });
      expect(state.shouldAppearInReady).toBe(false);
    });

    it("should disable PDF/XML buttons if SAT not validated", () => {
      const ticket = { status: "cfdi_validated" };
      const invoice = {
        isCfdiValidated: true,
        satValidated: false,
        xmlContent: "<cfdi:Comprobante Total=\"100.00\"><cfdi:Emisor Rfc=\"AAA010101AAA\"/><cfdi:Receptor Rfc=\"CABR8503221X6\"/><tfd:TimbreFiscalDigital UUID=\"123\" FechaTimbrado=\"2023\" SelloCFD=\"S1\" SelloSAT=\"S2\" NoCertificadoSAT=\"N1\"/></cfdi:Comprobante>",
        folioFiscal: "UUID-1",
        total: 100.00
      };
      const state = getBillingCanonicalState({ ticket, invoice });
      expect(state.canViewPdf).toBe(false);
      expect(state.canDownloadXml).toBe(false);
    });
  });

  describe("Fase 12H — Reconciliación real SAT", () => {
    it("should allow invoice SAT Vigente + ticket requires_manual_review viejo -> ready", () => {
      const ticket = { status: "requires_manual_review", rfcReceptor: "CABR8503221X6" };
      const invoice = {
        isCfdiValidated: true,
        satValidated: true,
        satStatus: "Vigente",
        xmlContent: "<cfdi:Comprobante Total=\"100.00\"><cfdi:Emisor Rfc=\"AAA010101AAA\"/><cfdi:Receptor Rfc=\"CABR8503221X6\"/><tfd:TimbreFiscalDigital UUID=\"123\" FechaTimbrado=\"2023\" SelloCFD=\"S1\" SelloSAT=\"S2\" NoCertificadoSAT=\"N1\"/></cfdi:Comprobante>",
        folioFiscal: "UUID-1",
        rfcReceptor: "CABR8503221X6",
        total: 100.00,
        pdfHtml: "<html></html>"
      };
      const state = getBillingCanonicalState({ ticket, invoice });
      expect(state.shouldAppearInReady).toBe(true);
      expect(state.isValidInvoice).toBe(true);
      expect(state.canViewPdf).toBe(true);
      expect(state.canDownloadXml).toBe(true);
    });

    it("should allow invoice SAT Vigente + XML real + UUID -> canDownloadXml true", () => {
      const invoice = {
        isCfdiValidated: true,
        satValidated: true,
        satStatus: "Vigente",
        xmlContent: "<xml/>",
        folioFiscal: "UUID-1",
        total: 100
      };
      const state = getBillingCanonicalState({ invoice });
      expect(state.canDownloadXml).toBe(true);
    });

    it("should not mark invoice SAT no localizado + job succeeded -> ready", () => {
      const ticket = { status: "cfdi_validated" };
      const invoice = {
        isCfdiValidated: true,
        satValidated: false,
        satStatus: "No Encontrado",
        xmlContent: "<xml/>",
        folioFiscal: "UUID-1"
      };
      const job = { status: "succeeded" };
      const state = getBillingCanonicalState({ ticket, invoice, job });
      expect(state.shouldAppearInReady).toBe(false);
    });

    it("should not mark invoice with uuid but satValidated false -> ready", () => {
      const invoice = {
        isCfdiValidated: true,
        satValidated: false,
        xmlContent: "<xml/>",
        folioFiscal: "UUID-1"
      };
      const state = getBillingCanonicalState({ invoice });
      expect(state.shouldAppearInReady).toBe(false);
    });

    it("should not mark ticket invoice_obtained + invoice no validada -> ready", () => {
      const ticket = { status: "invoice_obtained" };
      const invoice = {
        isCfdiValidated: true,
        satValidated: false,
        xmlContent: "<xml/>",
        folioFiscal: "UUID-1"
      };
      const state = getBillingCanonicalState({ ticket, invoice });
      expect(state.shouldAppearInReady).toBe(false);
    });

    it("should not mark job succeeded without satValidated -> ready", () => {
      const job = { status: "succeeded", satValidated: false };
      const state = getBillingCanonicalState({ job });
      expect(state.shouldAppearInReady).toBe(false);
    });

    it("should resolve relation by sourceTicketId over reference", () => {
      const tickets = [
        { id: "t1", reference: "REF1" },
        { id: "t2", reference: "REF2" }
      ];
      const invoices = [
        { id: "i1", sourceTicketId: "t2", reference: "REF1" }
      ];
      const resolved = resolveRelatedBillingDocs({ invoice: invoices[0], tickets, invoices });
      expect(resolved.ticket.id).toBe("t2");
    });

    it("should not relate docs solely by merchant/total", () => {
      const tickets = [
        { id: "t1", nombreEmisor: "OXXO", total: 100 },
        { id: "t2", nombreEmisor: "OXXO", total: 100 }
      ];
      const invoices = [
        { id: "i1", nombreEmisor: "OXXO", total: 100 }
      ];
      const resolved = resolveRelatedBillingDocs({ invoice: invoices[0], tickets, invoices });
      expect(resolved.ticket).toBeNull();
    });

    it("should not let old ticket status degrade validated invoice", () => {
      const ticket = { status: "runner_processing" };
      const invoice = {
        isCfdiValidated: true,
        satValidated: true,
        satStatus: "Vigente",
        xmlContent: "<xml/>",
        folioFiscal: "UUID-1",
        total: 100
      };
      const state = getBillingCanonicalState({ ticket, invoice });
      expect(state.shouldAppearInReady).toBe(true);
    });

    it("should not enable PDF/XML for invalid invoice", () => {
      const invoice = {
        isCfdiValidated: true,
        satValidated: false,
        xmlContent: "<xml/>",
        folioFiscal: "UUID-1"
      };
      const state = getBillingCanonicalState({ invoice });
      expect(state.canViewPdf).toBe(false);
      expect(state.canDownloadXml).toBe(false);
    });
  });

  describe("Fase 12I — Persistencia y sincronización", () => {
    it("should report invoice_missing_for_validated_cfdi when ticket is cfdi_validated but invoice real is missing", () => {
      const ticket = { status: "cfdi_validated", total: 100 };
      const invoice = undefined; // missing
      const state = getBillingCanonicalState({ ticket, invoice });
      expect(state.canonicalStatus).toBe("invoice_missing_for_validated_cfdi");
      expect(state.shouldAppearInReady).toBe(false);
      expect(state.shouldAppearInAttention).toBe(true);
      expect(state.message).toBe("CFDI validado, pero falta sincronizar el documento de factura.");
    });

    it("should report invoice_missing_for_validated_cfdi when ticket is cfdi_validated but invoice is synthetic", () => {
      const ticket = { status: "cfdi_validated", total: 100 };
      const invoice = { id: "inv-fallback-123", synthetic: true, total: 100 };
      const state = getBillingCanonicalState({ ticket, invoice });
      expect(state.canonicalStatus).toBe("invoice_missing_for_validated_cfdi");
      expect(state.shouldAppearInReady).toBe(false);
    });

    it("should allow invoice real SAT Vigente to appear in Listos", () => {
      const ticket = { status: "cfdi_validated", total: 100 };
      const invoice = {
        id: "inv-real-123",
        isCfdiValidated: true,
        satValidated: true,
        satStatus: "vigente",
        xmlContent: "<xml/>",
        folioFiscal: "UUID-1",
        total: 100,
        synthetic: false
      };
      const state = getBillingCanonicalState({ ticket, invoice });
      expect(state.shouldAppearInReady).toBe(true);
    });

    it("should not let invoice synthetic SAT Vigente appear in Listos", () => {
      const ticket = { status: "cfdi_validated", total: 100 };
      const invoice = {
        id: "inv-fallback-123",
        isCfdiValidated: true,
        satValidated: true,
        satStatus: "vigente",
        xmlContent: "<xml/>",
        folioFiscal: "UUID-1",
        total: 100,
        synthetic: true
      };
      const state = getBillingCanonicalState({ ticket, invoice });
      expect(state.shouldAppearInReady).toBe(false);
    });

    it("should not let invoice no validada appear in Listos", () => {
      const ticket = { status: "cfdi_validated", total: 100 };
      const invoice = {
        id: "inv-real-123",
        isCfdiValidated: true,
        satValidated: false,
        satStatus: "No Encontrado",
        xmlContent: "<xml/>",
        folioFiscal: "UUID-1",
        total: 100,
        synthetic: false
      };
      const state = getBillingCanonicalState({ ticket, invoice });
      expect(state.shouldAppearInReady).toBe(false);
    });

    it("should not degrade validated invoice due to old ticket status", () => {
      const ticket = { status: "requires_manual_review", total: 100 };
      const invoice = {
        id: "inv-real-123",
        isCfdiValidated: true,
        satValidated: true,
        satStatus: "vigente",
        xmlContent: "<xml/>",
        folioFiscal: "UUID-1",
        total: 100,
        synthetic: false
      };
      const state = getBillingCanonicalState({ ticket, invoice });
      expect(state.shouldAppearInReady).toBe(true);
    });

    it("should allow ticket with previousReviewError to appear in Listos if invoice is validated", () => {
      const ticket = { status: "cfdi_validated", previousReviewError: { code: "ERROR" }, total: 100 };
      const invoice = {
        id: "inv-real-123",
        isCfdiValidated: true,
        satValidated: true,
        satStatus: "vigente",
        xmlContent: "<xml/>",
        folioFiscal: "UUID-1",
        total: 100,
        synthetic: false
      };
      const state = getBillingCanonicalState({ ticket, invoice });
      expect(state.shouldAppearInReady).toBe(true);
    });

    it("should ensure frontend does not write directly or modify database state directly on SAT validation", () => {
      const ticket = { status: "cfdi_validated", total: 100 };
      const invoice = {
        id: "inv-real-123",
        isCfdiValidated: true,
        satValidated: true,
        satStatus: "vigente",
        xmlContent: "<xml/>",
        folioFiscal: "UUID-1",
        total: 100,
        synthetic: false
      };
      
      const beforeState = JSON.stringify({ ticket, invoice });
      getBillingCanonicalState({ ticket, invoice });
      const afterState = JSON.stringify({ ticket, invoice });
      
      expect(beforeState).toBe(afterState);
    });
  });

  describe("Fase 12J — buildBillingDashboardStats", () => {
    const userId = "user-123";

    it("should calculate processedCount = 1 for 1 valid invoice", () => {
      const tickets = [
        { id: "t1", userId, status: "cfdi_validated", total: 100, invoiceId: "inv-1" }
      ];
      const invoices = [
        {
          id: "inv-1",
          userId,
          isCfdiValidated: true,
          satValidated: true,
          satStatus: "vigente",
          xmlContent: "<xml/>",
          folioFiscal: "UUID-1",
          total: 100,
          synthetic: false
        }
      ];
      const stats = buildBillingDashboardStats({ tickets, invoices, userId });
      expect(stats.processedCount).toBe(1);
      expect(stats.followUpCount).toBe(0);
    });

    it("should calculate followUpCount = 1 for 1 ticket in review", () => {
      const tickets = [
        { id: "t1", userId, status: "requires_manual_review", total: 100 }
      ];
      const invoices: any[] = [];
      const stats = buildBillingDashboardStats({ tickets, invoices, userId });
      expect(stats.processedCount).toBe(0);
      expect(stats.followUpCount).toBe(1);
    });

    it("should count related ticket, invoice and job as 1 item, not 3", () => {
      const tickets = [
        { id: "t1", userId, status: "cfdi_validated", total: 100, invoiceId: "inv-1" }
      ];
      const invoices = [
        {
          id: "inv-1",
          userId,
          isCfdiValidated: true,
          satValidated: true,
          satStatus: "vigente",
          xmlContent: "<xml/>",
          folioFiscal: "UUID-1",
          total: 100,
          synthetic: false,
          ticketId: "t1"
        }
      ];
      const jobs = [
        { id: "job-1", userId, ticketId: "t1", status: "succeeded" }
      ];
      const stats = buildBillingDashboardStats({ tickets, invoices, jobs, userId });
      expect(stats.processedCount).toBe(1);
      expect(stats.followUpCount).toBe(0);
    });

    it("should ignore hiddenFromUser, deletedAt, and deleted status", () => {
      const tickets = [
        { id: "t1", userId, status: "cfdi_validated", total: 100, invoiceId: "inv-1" },
        { id: "t2", userId, status: "deleted", total: 100 },
        { id: "t3", userId, status: "cfdi_validated", deletedAt: "now", total: 100 },
        { id: "t4", userId, status: "cfdi_validated", hiddenFromUser: true, total: 100 }
      ];
      const invoices = [
        {
          id: "inv-1",
          userId,
          isCfdiValidated: true,
          satValidated: true,
          satStatus: "vigente",
          xmlContent: "<xml/>",
          folioFiscal: "UUID-1",
          total: 100,
          synthetic: false
        }
      ];
      const stats = buildBillingDashboardStats({ tickets, invoices, userId });
      expect(stats.processedCount).toBe(1);
      expect(stats.followUpCount).toBe(0);
    });

    it("should ignore synthetic invoices and fallbacks", () => {
      const tickets = [
        { id: "t1", userId, status: "cfdi_validated", total: 100, invoiceId: "inv-fallback-1" }
      ];
      const invoices = [
        {
          id: "inv-fallback-1",
          userId,
          isCfdiValidated: true,
          satValidated: true,
          satStatus: "vigente",
          xmlContent: "<xml/>",
          folioFiscal: "UUID-1",
          total: 100,
          synthetic: true
        }
      ];
      const stats = buildBillingDashboardStats({ tickets, invoices, userId });
      expect(stats.processedCount).toBe(0);
      expect(stats.followUpCount).toBe(1);
    });

    it("should ignore documents from other users or missing userId", () => {
      const tickets = [
        { id: "t1", userId: "other-user", status: "cfdi_validated", total: 100 },
        { id: "t2", status: "cfdi_validated", total: 100 }
      ];
      const invoices = [
        {
          id: "inv-1",
          userId: "other-user",
          isCfdiValidated: true,
          satValidated: true,
          satStatus: "vigente",
          xmlContent: "<xml/>",
          folioFiscal: "UUID-1",
          total: 100,
          synthetic: false
        }
      ];
      const stats = buildBillingDashboardStats({ tickets, invoices, userId });
      expect(stats.processedCount).toBe(0);
      expect(stats.followUpCount).toBe(0);
    });

    it("should not count invalid invoices as processed", () => {
      const tickets = [
        { id: "t1", userId, status: "cfdi_validated", total: 100, invoiceId: "inv-1" }
      ];
      const invoices = [
        {
          id: "inv-1",
          userId,
          isCfdiValidated: true,
          satValidated: false,
          satStatus: "No Encontrado",
          xmlContent: "<xml/>",
          folioFiscal: "UUID-1",
          total: 100,
          synthetic: false
        }
      ];
      const stats = buildBillingDashboardStats({ tickets, invoices, userId });
      expect(stats.processedCount).toBe(0);
      expect(stats.followUpCount).toBe(1);
    });

    it("should calculate cycle stats correctly and avoid inflation from old or deleted items", () => {
      const fiscalProfile = {
        userId,
        plan: "brisa",
        planStartDate: "2026-07-01T00:00:00.000Z"
      };

      const tickets = [
        { id: "t1", userId, status: "cfdi_validated", total: 100, invoiceId: "inv-1" },
        { id: "t2", userId, status: "cfdi_validated", total: 100, invoiceId: "inv-2" }
      ];

      const invoices = [
        {
          id: "inv-1",
          userId,
          isCfdiValidated: true,
          satValidated: true,
          satStatus: "vigente",
          xmlContent: "<xml/>",
          folioFiscal: "UUID-1",
          total: 100,
          synthetic: false,
          createdAt: "2026-07-05T12:00:00.000Z"
        },
        {
          id: "inv-2",
          userId,
          isCfdiValidated: true,
          satValidated: true,
          satStatus: "vigente",
          xmlContent: "<xml/>",
          folioFiscal: "UUID-2",
          total: 100,
          synthetic: false,
          createdAt: "2026-06-25T12:00:00.000Z"
        }
      ];

      const stats = buildBillingDashboardStats({ tickets, invoices, fiscalProfile, userId });
      expect(stats.cycleLimit).toBe(10);
      expect(stats.cycleUsed).toBe(1);
      expect(stats.cycleRemaining).toBe(9);
    });
  });
});

describe("Customer billing state", () => {
  it("hides connector and portal causes behind a single review message", () => {
    const state = getCustomerBillingState({
      ticket: {
        status: "requires_manual_review",
        reviewReasonCode: "CONNECTOR_NOT_FOUND",
        errorMsg: "Este comercio requiere un conector aprobado antes de facturar."
      }
    });

    expect(state.kind).toBe("unavailable");
    expect(state.badgeLabel).toBe("EN REVISIÓN");
    expect(state.message.toLowerCase()).not.toContain("conector");
    expect(state.message.toLowerCase()).not.toContain("portal");
    expect(state.message.toLowerCase()).not.toContain("reintento");
  });

  it("shows a correction action only for ticket fields that genuinely need correction", () => {
    const state = getCustomerBillingState({
      ticket: {
        status: "requires_user_correction",
        reviewReasonCode: "MISSING_REQUIRED_FIELDS"
      }
    });

    expect(state.kind).toBe("needs_correction");
    expect(state.canEdit).toBe(true);
    expect(state.title).toBe("Necesitamos confirmar un dato");
  });

  it("keeps active work in a neutral processing state", () => {
    const state = getCustomerBillingState({
      ticket: { status: "runner_processing", total: 47 }
    });

    expect(state.kind).toBe("processing");
    expect(state.badgeLabel).toBe("EN PROCESO");
    expect(state.message.toLowerCase()).not.toContain("robot");
    expect(state.message.toLowerCase()).not.toContain("playwright");
  });

  it("does not ask customers to resolve CAPTCHA challenges", () => {
    const state = getCustomerBillingState({
      ticket: { status: "waiting_user_captcha", captchaFlowActive: true }
    });

    expect(state.kind).toBe("unavailable");
    expect(state.requiresCaptcha).toBe(false);
    expect(state.badgeLabel).toBe("EN REVISIÓN");
  });
});
