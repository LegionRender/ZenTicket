import { describe, it, expect } from "vitest";
import { ERROR_CATALOG } from "../../../runner/src/engines/errors/errorCatalog";
import { getFriendlyMessage } from "../../../runner/src/engines/errors/friendlyMessages";
import { createDiagnosticSnapshot } from "../../../runner/src/engines/errors/diagnosticSnapshot";
import { classifyAutomationError } from "../../../runner/src/engines/errors/classifyAutomationError";
import { validateCfdiXml } from "../../../runner/src/engines/cfdi/validateCfdiXml";

describe("ZenTicket Error and Diagnostic System", () => {
  describe("Error Catalog Verification", () => {
    it("should contain critical setup and navigation codes", () => {
      expect(ERROR_CATALOG.CONNECTOR_NOT_FOUND).toBeDefined();
      expect(ERROR_CATALOG.PORTAL_MAP_NOT_FOUND).toBeDefined();
      expect(ERROR_CATALOG.PORTAL_MAP_INVALID).toBeDefined();
      expect(ERROR_CATALOG.PLAYWRIGHT_BROWSER_LAUNCH_FAILED).toBeDefined();
      expect(ERROR_CATALOG.PORTAL_NAVIGATION_FAILED).toBeDefined();
      expect(ERROR_CATALOG.FIELD_RESOLUTION_FAILED).toBeDefined();
      expect(ERROR_CATALOG.REQUIRED_FIELD_MISSING).toBeDefined();
    });

    it("should contain critical verifier and sat codes", () => {
      expect(ERROR_CATALOG.XML_NOT_DOWNLOADED).toBeDefined();
      expect(ERROR_CATALOG.PDF_NOT_DOWNLOADED).toBeDefined();
      expect(ERROR_CATALOG.CFDI_INVALID_XML).toBeDefined();
      expect(ERROR_CATALOG.CFDI_TOTAL_MISMATCH).toBeDefined();
      expect(ERROR_CATALOG.CFDI_RFC_RECEPTOR_MISMATCH).toBeDefined();
      expect(ERROR_CATALOG.CFDI_RFC_EMISOR_MISMATCH).toBeDefined();
      expect(ERROR_CATALOG.CFDI_UUID_MISSING).toBeDefined();
      expect(ERROR_CATALOG.CFDI_NOT_FOUND_IN_SAT).toBeDefined();
      expect(ERROR_CATALOG.SAT_VALIDATION_TIMEOUT).toBeDefined();
    });

    it("should contain database and fallback codes", () => {
      expect(ERROR_CATALOG.TICKET_ALREADY_INVOICED).toBeDefined();
      expect(ERROR_CATALOG.EXISTING_INVOICE_RECOVERY_FAILED).toBeDefined();
      expect(ERROR_CATALOG.FIRESTORE_UPDATE_FAILED).toBeDefined();
      expect(ERROR_CATALOG.STORAGE_UPLOAD_FAILED).toBeDefined();
      expect(ERROR_CATALOG.UNKNOWN_RUNNER_ERROR).toBeDefined();
    });
  });

  describe("Friendly Messages Mappings", () => {
    it("should map CFDI codes to descriptive friendly messages", () => {
      expect(getFriendlyMessage("CFDI_TOTAL_MISMATCH")).toContain("total");
      expect(getFriendlyMessage("CFDI_RFC_RECEPTOR_MISMATCH")).toContain("RFC");
      expect(getFriendlyMessage("CFDI_RFC_EMISOR_MISMATCH")).toContain("RFC");
      expect(getFriendlyMessage("CFDI_UUID_MISSING")).toContain("Folio Fiscal");
      expect(getFriendlyMessage("CFDI_INVALID_XML")).toContain("XML");
    });

    it("should return fallback message for unknown error codes", () => {
      expect(getFriendlyMessage("NON_EXISTENT_CODE")).toContain("inesperado");
    });
  });

  describe("Diagnostic Snapshot Structure", () => {
    it("should create a valid diagnostic snapshot object with all required properties", () => {
      const snapshot = createDiagnosticSnapshot({
        userId: "user-123",
        ticketId: "ticket-456",
        jobId: "job-789",
        stage: "cfdi_validation",
        errorCode: "CFDI_TOTAL_MISMATCH",
        friendlyMessage: "El total no coincide",
        wasAlreadyInvoiced: false,
        captchaDetected: false
      });

      expect(snapshot.userId).toBe("user-123");
      expect(snapshot.ticketId).toBe("ticket-456");
      expect(snapshot.jobId).toBe("job-789");
      expect(snapshot.stage).toBe("cfdi_validation");
      expect(snapshot.errorCode).toBe("CFDI_TOTAL_MISMATCH");
      expect(snapshot.friendlyMessage).toBe("El total no coincide");
      expect(snapshot.wasAlreadyInvoiced).toBe(false);
      expect(snapshot.captchaDetected).toBe(false);
      expect(snapshot.timestamp).toBeDefined();
    });
  });

  describe("Classify Automation Error Lógica", () => {
    it("should classify CAPTCHA_DETECTED as blocking and retryable", () => {
      const classification = classifyAutomationError("CAPTCHA_DETECTED");
      expect(classification.blocking).toBe(true);
      expect(classification.retryable).toBe(true);
      expect(classification.requiresHumanReview).toBe(true);
    });

    it("should classify CFDI_TOTAL_MISMATCH as blocking and not retryable", () => {
      const classification = classifyAutomationError("CFDI_TOTAL_MISMATCH");
      expect(classification.blocking).toBe(true);
      expect(classification.retryable).toBe(false);
    });

    it("should classify SAT_VALIDATION_TIMEOUT as retryable based on attempts policy", () => {
      const classification1 = classifyAutomationError("SAT_VALIDATION_TIMEOUT", { attemptNumber: 2 });
      expect(classification1.retryable).toBe(true);
      expect(classification1.blocking).toBe(false);

      const classification2 = classifyAutomationError("SAT_VALIDATION_TIMEOUT", { attemptNumber: 6 });
      expect(classification2.retryable).toBe(false);
    });

    it("should classify TICKET_ALREADY_INVOICED as blocking if no XML was downloaded", () => {
      const classificationNoXml = classifyAutomationError("TICKET_ALREADY_INVOICED", { wasXmlDownloaded: false });
      expect(classificationNoXml.blocking).toBe(true);
      expect(classificationNoXml.retryable).toBe(false);

      const classificationWithXml = classifyAutomationError("TICKET_ALREADY_INVOICED", { wasXmlDownloaded: true });
      expect(classificationWithXml.blocking).toBe(false);
      expect(classificationWithXml.retryable).toBe(false);
    });

    it("should return fallback classification for unknown errors", () => {
      const classification = classifyAutomationError("SOME_CRAP_CODE");
      expect(classification.retryable).toBe(true);
      expect(classification.blocking).toBe(true);
    });
  });

  describe("validateCfdiXml Edge Cases", () => {
    function buildMockXml(opts: {
      uuid?: string;
      total?: string;
      rfcEmisor?: string;
      rfcReceptor?: string;
      hasTimbre?: boolean;
    }) {
      const uuidAttr = opts.uuid ? `UUID="${opts.uuid}"` : "";
      const emisorTag = opts.rfcEmisor ? `<cfdi:Emisor Rfc="${opts.rfcEmisor}" RegimenFiscal="601" />` : "";
      const receptorTag = opts.rfcReceptor ? `<cfdi:Receptor Rfc="${opts.rfcReceptor}" RegimenFiscalReceptor="626" UsoCFDI="G03" />` : "";
      
      return `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Total="${opts.total ?? "100.00"}" LugarExpedicion="01000" TipoDeComprobante="I" FormaPago="04">
  ${emisorTag}
  ${receptorTag}
  ${opts.hasTimbre !== false ? `<cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" ${uuidAttr} FechaTimbrado="2026-07-08T12:00:00" NoCertificadoSAT="00001000000500000000" />
  </cfdi:Complemento>` : ""}
</cfdi:Comprobante>`;
    }

    it("should fail with CFDI_TOTAL_MISMATCH when total is 0.00 but expected is positive", () => {
      const xml = buildMockXml({
        uuid: "12345678-1234-1234-1234-123456789012",
        total: "0.00",
        rfcEmisor: "AAA010101AAA",
        rfcReceptor: "BBB010101BBB"
      });
      const result = validateCfdiXml(xml, "AAA010101AAA", "BBB010101BBB", 100.00);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("CFDI_TOTAL_MISMATCH");
    });

    it("should fail with CFDI_TOTAL_MISMATCH when total differs significantly", () => {
      const xml = buildMockXml({
        uuid: "12345678-1234-1234-1234-123456789012",
        total: "150.00",
        rfcEmisor: "AAA010101AAA",
        rfcReceptor: "BBB010101BBB"
      });
      const result = validateCfdiXml(xml, "AAA010101AAA", "BBB010101BBB", 100.00);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("CFDI_TOTAL_MISMATCH");
    });

    it("should fail with CFDI_RFC_RECEPTOR_MISMATCH when receptor RFC differs", () => {
      const xml = buildMockXml({
        uuid: "12345678-1234-1234-1234-123456789012",
        total: "100.00",
        rfcEmisor: "AAA010101AAA",
        rfcReceptor: "WRONG_RFC"
      });
      const result = validateCfdiXml(xml, "AAA010101AAA", "BBB010101BBB", 100.00);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("CFDI_RFC_RECEPTOR_MISMATCH");
    });

    it("should fail with CFDI_RFC_EMISOR_MISMATCH when emisor RFC differs", () => {
      const xml = buildMockXml({
        uuid: "12345678-1234-1234-1234-123456789012",
        total: "100.00",
        rfcEmisor: "WRONG_EMISOR",
        rfcReceptor: "BBB010101BBB"
      });
      const result = validateCfdiXml(xml, "AAA010101AAA", "BBB010101BBB", 100.00);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("CFDI_RFC_EMISOR_MISMATCH");
    });

    it("should fail with CFDI_MISSING_UUID when UUID is not present", () => {
      const xml = buildMockXml({
        total: "100.00",
        rfcEmisor: "AAA010101AAA",
        rfcReceptor: "BBB010101BBB"
      });
      const result = validateCfdiXml(xml, "AAA010101AAA", "BBB010101BBB", 100.00);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("CFDI_MISSING_UUID");
    });

    it("should pass when all values match exactly", () => {
      const xml = buildMockXml({
        uuid: "12345678-1234-1234-1234-123456789012",
        total: "100.00",
        rfcEmisor: "AAA010101AAA",
        rfcReceptor: "BBB010101BBB"
      });
      const result = validateCfdiXml(xml, "AAA010101AAA", "BBB010101BBB", 100.00);
      expect(result.isValid).toBe(true);
      expect(result.uuid).toBe("12345678-1234-1234-1234-123456789012");
      expect(result.total).toBe(100.00);
    });
  });
});
