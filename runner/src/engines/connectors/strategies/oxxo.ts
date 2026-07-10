import { Page } from "playwright";
import { ConnectorStrategy } from "../types";

export const oxxoStrategy: ConnectorStrategy = {
  connectorId: "oxxo",

  async selfHealFields(page: Page, ticket: any): Promise<void> {
    try {
      const coloniaInput = page.locator("[id='form:coloniaPend']:visible").first();
      if (await coloniaInput.count().catch(() => 0)) {
        const isColoniaEmpty = await coloniaInput.evaluate((el: any) => !el.value).catch(() => true);
        if (isColoniaEmpty) {
          console.log("[self-heal] Oxxo pending flow detected. Filling empty Colonia field...");
          await coloniaInput.fill("Centro").catch(() => null);
          await page.waitForTimeout(500);
        }
      }

      const estadoSelect = page.locator("[id='form:estadoPen']:visible").first();
      if (await estadoSelect.count().catch(() => 0)) {
        const isEstadoEmpty = await page.locator("[id='form:estadoPen_input']").first().evaluate((el: any) => !el.value).catch(() => true);
        if (isEstadoEmpty) {
          const zip = ticket.codigoPostal || "64000";
          const getEstadoFromPostalCode = (z: string) => {
            const prefix = z.substring(0, 2);
            const prefixNum = parseInt(prefix);
            if (prefixNum >= 1 && prefixNum <= 16) return "CIUDAD DE MEXICO";
            if (prefixNum >= 50 && prefixNum <= 57) return "ESTADO DE MEXICO";
            if (prefixNum >= 64 && prefixNum <= 67) return "NUEVO LEON";
            if (prefixNum >= 44 && prefixNum <= 45) return "JALISCO";
            if (prefixNum >= 89 && prefixNum <= 89) return "TAMAULIPAS";
            if (prefixNum >= 22 && prefixNum <= 22) return "BAJA CALIFORNIA";
            if (prefixNum >= 76 && prefixNum <= 76) return "QUERETARO";
            if (prefixNum >= 77 && prefixNum <= 77) return "QUINTANA ROO";
            if (prefixNum >= 97 && prefixNum <= 97) return "YUCATAN";
            if (prefixNum >= 72 && prefixNum <= 72) return "PUEBLA";
            if (prefixNum >= 37 && prefixNum <= 37) return "GUANAJUATO";
            return "CIUDAD DE MEXICO";
          };
          const estadoName = getEstadoFromPostalCode(zip);
          console.log(`[self-heal] Oxxo pending flow detected. Selecting Estado "${estadoName}" for Zip Code "${zip}"...`);
          
          await estadoSelect.click().catch(() => null);
          await page.waitForTimeout(1000);
          
          const option = page.locator("[id='form:estadoPen_panel'] li.ui-selectonemenu-item").filter({ hasText: estadoName }).first();
          if (await option.count().catch(() => 0)) {
            await option.click().catch(() => null);
            await page.waitForTimeout(1500);
          } else {
            await page.locator("[id='form:estadoPen_input']").first().selectOption(estadoName).catch(() => null);
            await page.waitForTimeout(1000);
          }
        }
      }
    } catch (err: any) {
      console.warn("[oxxo-strategy] Self-heal error:", err.message);
    }
  },

  async detectDownloadLinks(page: Page): Promise<{ clickedXml?: boolean; clickedPdf?: boolean }> {
    let clickedPdf = false;
    let clickedXml = false;
    try {
      const oxxoPdfBtn = page.locator("div, span, a, button").filter({ hasText: /Descargar PDF/i }).first();
      const oxxoXmlBtn = page.locator("div, span, a, button").filter({ hasText: /Descargar XML/i }).first();

      if (await oxxoPdfBtn.isVisible().catch(() => false)) {
        console.log("[oxxo-strategy] PDF download button detected. Clicking...");
        await oxxoPdfBtn.click().catch(() => null);
        clickedPdf = true;
        await page.waitForTimeout(3000);
      }
      if (await oxxoXmlBtn.isVisible().catch(() => false)) {
        console.log("[oxxo-strategy] XML download button detected. Clicking...");
        await oxxoXmlBtn.click().catch(() => null);
        clickedXml = true;
        await page.waitForTimeout(3000);
      }
    } catch (err: any) {
      console.error("[oxxo-strategy] Error detecting download links:", err.message);
    }
    return { clickedXml, clickedPdf };
  },

  detectBusinessRuleViolation(portalErrorText: string, ticketDate?: string): { errorCode: string; errorMsg: string } | null {
    if (portalErrorText === "TICKET_TOO_NEW") {
      let errorMsg = "OXXO puede tardar hasta 24 horas en sincronizar tickets nuevos. Reintentaremos automáticamente más tarde.";
      if (ticketDate) {
        errorMsg = `El ticket es reciente (${ticketDate}). OXXO puede tardar hasta 24 horas en sincronizar. Reintentaremos automáticamente más tarde.`;
      }
      return {
        errorCode: "TICKET_TOO_NEW",
        errorMsg
      };
    }
    return null;
  }
};
