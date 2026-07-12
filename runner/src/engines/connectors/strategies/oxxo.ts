import { Page } from "playwright";
import { ConnectorStrategy } from "../types";

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}

function stateForPostalCode(zipCode: string): string {
  const prefix = Number.parseInt(zipCode.substring(0, 2), 10);
  if (prefix >= 1 && prefix <= 16) return "CIUDAD DE MEXICO";
  if (prefix >= 50 && prefix <= 57) return "ESTADO DE MEXICO";
  if (prefix >= 64 && prefix <= 67) return "NUEVO LEON";
  if (prefix >= 44 && prefix <= 45) return "JALISCO";
  if (prefix === 89) return "TAMAULIPAS";
  if (prefix === 22) return "BAJA CALIFORNIA";
  if (prefix === 76) return "QUERETARO";
  if (prefix === 77) return "QUINTANA ROO";
  if (prefix === 97) return "YUCATAN";
  if (prefix === 72) return "PUEBLA";
  if (prefix === 37) return "GUANAJUATO";
  return "CIUDAD DE MEXICO";
}

export const oxxoStrategy: ConnectorStrategy = {
  connectorId: "oxxo",

  async selfHealFields(page: Page, ticket: any): Promise<void> {
    const coloniaInput = page.locator("[id='form:coloniaPend']:visible").first();
    if (await coloniaInput.count()) {
      const isColoniaEmpty = await coloniaInput.evaluate((element: HTMLInputElement) => !element.value);
      if (isColoniaEmpty) {
        await coloniaInput.fill("Centro");
        const registeredValue = await coloniaInput.inputValue();
        if (registeredValue !== "Centro") {
          throw { code: "PORTAL_FIELD_POSTCONDITION_FAILED", message: "El portal no registrÃ³ la colonia requerida." };
        }
      }
    }

    const estadoSelect = page.locator("[id='form:estadoPen']:visible").first();
    if (!await estadoSelect.count()) return;

    const stateInput = page.locator("[id='form:estadoPen_input']").first();
    const isStateEmpty = await stateInput.evaluate((element: HTMLInputElement) => !element.value);
    if (!isStateEmpty) return;

    const stateName = stateForPostalCode(String(ticket.codigoPostal || "64000"));
    await estadoSelect.click();
    const option = page.locator("[id='form:estadoPen_panel'] li.ui-selectonemenu-item")
      .filter({ hasText: stateName })
      .first();
    await option.waitFor({ state: "visible", timeout: 10000 });
    await option.click();
    await stateInput.waitFor({ state: "visible", timeout: 10000 });
    const registeredState = await stateInput.inputValue();
    if (normalize(registeredState) !== normalize(stateName)) {
      throw {
        code: "PORTAL_FIELD_POSTCONDITION_FAILED",
        message: `El portal no registrÃ³ el estado requerido (${stateName}).`
      };
    }
  },

  async detectDownloadLinks(page: Page): Promise<{ clickedXml?: boolean; clickedPdf?: boolean }> {
    let clickedPdf = false;
    let clickedXml = false;
    const oxxoPdfBtn = page.locator("div, span, a, button").filter({ hasText: /Descargar PDF/i }).first();
    const oxxoXmlBtn = page.locator("div, span, a, button").filter({ hasText: /Descargar XML/i }).first();

    if (await oxxoPdfBtn.isVisible()) {
      await oxxoPdfBtn.click();
      clickedPdf = true;
    }
    if (await oxxoXmlBtn.isVisible()) {
      await oxxoXmlBtn.click();
      clickedXml = true;
    }
    return { clickedXml, clickedPdf };
  },

  detectBusinessRuleViolation(portalErrorText: string, ticketDate?: string): { errorCode: string; errorMsg: string } | null {
    if (portalErrorText === "TICKET_TOO_NEW") {
      let errorMsg = "OXXO puede tardar hasta 24 horas en sincronizar tickets nuevos. Reintentaremos automÃ¡ticamente mÃ¡s tarde.";
      if (ticketDate) {
        errorMsg = `El ticket es reciente (${ticketDate}). OXXO puede tardar hasta 24 horas en sincronizar. Reintentaremos automÃ¡ticamente mÃ¡s tarde.`;
      }
      return { errorCode: "TICKET_TOO_NEW", errorMsg };
    }
    return null;
  }
};
