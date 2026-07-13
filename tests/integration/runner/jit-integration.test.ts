import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, Browser, Page } from "playwright";
import * as path from "path";
import * as fs from "fs";
import { recoverExistingInvoiceFromPortal } from "../../../runner/src/engines/automation/recoverInvoice";

describe("JIT and Recovery Integration Tests with Playwright", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  it("should detect recovery flow and click download buttons on mock portal page", async () => {
    const page = await browser.newPage();

    // Set mock HTML content representing a portal indicating "Ticket ya facturado"
    await page.setContent(`
      <html>
        <head><title>Portal de Facturación</title></head>
        <body>
          <div id="status-message">El ticket ya fue facturado anteriormente con Folio 486259.</div>
          <button id="btn-reprint">Reimprimir Factura</button>
          <div id="download-links" style="display: none;">
            <button id="download-xml">Descargar XML de Factura</button>
            <button id="download-pdf">Descargar PDF de Comprobante</button>
          </div>
          <script>
            document.getElementById('btn-reprint').addEventListener('click', () => {
              document.getElementById('download-links').style.display = 'block';
            });
          </script>
        </body>
      </html>
    `);

    // Mock a Strategy if needed
    const strategy = {
      connectorId: "mock-connector",
      detectDownloadLinks: async (p: Page) => {
        const xmlBtn = p.locator("#download-xml");
        const pdfBtn = p.locator("#download-pdf");
        if (await xmlBtn.isVisible().catch(() => false)) {
          await xmlBtn.click().catch(() => null);
          await p.waitForTimeout(100);
          return { clickedXml: true, clickedPdf: true };
        }
        return {};
      }
    };

    // Prepare temp directory
    const tmpDir = path.resolve(__dirname, "../../../temp-recovery-integration-" + Date.now());
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Write a dummy XML file so collectDocuments can find it
    const mockXmlPath = path.join(tmpDir, "cfdi.xml");
    fs.writeFileSync(mockXmlPath, `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Total="345.50">
  <cfdi:Emisor Rfc="AAA010101AAA" />
  <cfdi:Receptor Rfc="CABR8503221X6" />
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="12345678-1234-1234-1234-123456789012" />
  </cfdi:Complemento>
</cfdi:Comprobante>`);

    try {
      // Mock ticket and fiscal profile
      const ticket = { expectedTicketTotal: 345.50 };
      const fiscalProfile = { rfc: "CABR8503221X6" };
      const portalMap = { rfc: "AAA010101AAA" };

      const result = await recoverExistingInvoiceFromPortal({
        page,
        ticket,
        fiscalProfile,
        portalMap,
        strategy,
        downloadedFiles: [{ filename: "cfdi.xml", path: mockXmlPath }],
        tmpDir,
        networkSniffer: null
      });

      expect(result.success).toBe(true);
      expect(result.xmlDownloaded).toBe(true);
      expect(result.xmlPath).toBeDefined();
      expect(result.wasAlreadyInvoiced).toBe(true);
    } finally {
      await page.close();
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  }, 30000);

  it("should fail recovery if no XML file is recovered", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <html>
        <body>
          <div id="status-message">El ticket ya fue facturado anteriormente con Folio 486259.</div>
        </body>
      </html>
    `);

    const tmpDir = path.resolve(__dirname, "../../../temp-recovery-failed-" + Date.now());
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    try {
      const result = await recoverExistingInvoiceFromPortal({
        page,
        ticket: { expectedTicketTotal: 345.50 },
        fiscalProfile: { rfc: "CABR8503221X6" },
        portalMap: { rfc: "AAA010101AAA" },
        downloadedFiles: [],
        tmpDir,
        networkSniffer: null
      });

      expect(result.success).toBe(false);
      expect(result.xmlDownloaded).toBe(false);
      expect(result.recoveryErrorCode).toBe("RECOVERY_FLOW_NOT_CONFIGURED");
    } finally {
      await page.close();
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  }, 30000);
});
