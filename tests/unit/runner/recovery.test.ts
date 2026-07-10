import { describe, it, expect } from "vitest";
import { getBillingCanonicalState } from "../../../src/workspace/utils/billingStateHelpers";
import { validateCfdiXml } from "../../../runner/src/engines/cfdi/validateCfdiXml";

describe("Fase 14 — Already Invoiced Recovery and Canonical States", () => {
  describe("getBillingCanonicalState status mappings", () => {
    it("should map to invoice_recovery_pending if recovery is active/pending", () => {
      const ticket = {
        status: "invoice_recovery_pending",
        wasAlreadyInvoiced: true,
        errorCode: "TICKET_ALREADY_INVOICED"
      };
      const invoice = {};
      const job = {};

      const state = getBillingCanonicalState({ ticket, invoice, job });

      expect(state.canonicalStatus).toBe("invoice_recovery_pending");
      expect(state.badgeLabel).toBe("RECUPERANDO CFDI");
      expect(state.shouldAppearInReady).toBe(false);
      expect(state.shouldAppearInProcess).toBe(true);
      expect(state.shouldAppearInAttention).toBe(false);
      expect(state.canDownloadXml).toBe(false);
      expect(state.canViewPdf).toBe(false);
    });

    it("should map to already_invoiced_unverified if recovery failed/attempts exhausted", () => {
      const ticket = {
        status: "already_invoiced_unverified",
        reviewReasonCode: "ALREADY_INVOICED_XML_NOT_RECOVERED",
        wasAlreadyInvoiced: true
      };
      const invoice = {};
      const job = {};

      const state = getBillingCanonicalState({ ticket, invoice, job });

      expect(state.canonicalStatus).toBe("already_invoiced_unverified");
      expect(state.badgeLabel).toBe("YA FACTURADO SIN XML");
      expect(state.shouldAppearInReady).toBe(false);
      expect(state.shouldAppearInProcess).toBe(false);
      expect(state.shouldAppearInAttention).toBe(true);
      expect(state.requiresManualReview).toBe(true);
      expect(state.canDownloadXml).toBe(false);
      expect(state.canViewPdf).toBe(false);
    });

    it("should show custom detail message and not 'unknown message' if control fields are present", () => {
      const ticket = {
        status: "custom_status",
        portalMessage: "Custom Portal Message",
        errorCode: "SOME_CODE"
      };
      const invoice = {};
      const job = {};

      const state = getBillingCanonicalState({ ticket, invoice, job });

      expect(state.canonicalStatus).toBe("requires_manual_review");
      expect(state.message).toBe("Custom Portal Message");
    });
  });

  describe("validateCfdiXml recovery conditions", () => {
    function buildMockXml(opts: {
      uuid?: string;
      total?: string;
      rfcEmisor?: string;
      rfcReceptor?: string;
    }) {
      return `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Total="${opts.total ?? "345.5"}" LugarExpedicion="01000" TipoDeComprobante="I" FormaPago="04">
  <cfdi:Emisor Rfc="${opts.rfcEmisor ?? "AAA010101AAA"}" RegimenFiscal="601" />
  <cfdi:Receptor Rfc="${opts.rfcReceptor ?? "CABR8503221X6"}" RegimenFiscalReceptor="626" UsoCFDI="G03" />
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="${opts.uuid ?? "12345678-1234-1234-1234-123456789012"}" FechaTimbrado="2026-07-08T12:00:00" NoCertificadoSAT="00001000000500000000" />
  </cfdi:Complemento>
</cfdi:Comprobante>`;
    }

    it("should succeed validation if all fields match", () => {
      const xml = buildMockXml({});
      const result = validateCfdiXml(xml, "AAA010101AAA", "CABR8503221X6", 345.5);
      expect(result.isValid).toBe(true);
    });

    it("should fail validation if total mismatches", () => {
      const xml = buildMockXml({ total: "100.0" });
      const result = validateCfdiXml(xml, "AAA010101AAA", "CABR8503221X6", 345.5);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("CFDI_TOTAL_MISMATCH");
    });

    it("should fail validation if receptor RFC mismatches", () => {
      const xml = buildMockXml({ rfcReceptor: "WRONG_RFC" });
      const result = validateCfdiXml(xml, "AAA010101AAA", "CABR8503221X6", 345.5);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("CFDI_RFC_RECEPTOR_MISMATCH");
    });
  });
});
