import { Page } from "playwright";

export interface ConnectorStrategy {
  connectorId: string;
  selfHealFields?: (page: Page, ticket: any) => Promise<void>;
  detectDownloadLinks?: (page: Page) => Promise<{
    xmlButtonSelector?: string;
    pdfButtonSelector?: string;
    clickedXml?: boolean;
    clickedPdf?: boolean;
  }>;
  detectBusinessRuleViolation?: (
    portalErrorText: string,
    ticketDate?: string
  ) => { errorCode: string; errorMsg: string } | null;
  normalizeInput?: (ticket: any) => any;
  beforeStep?: (page: Page, step: any, ticket: any) => Promise<void>;
  afterStep?: (page: Page, step: any, ticket: any) => Promise<void>;
}
