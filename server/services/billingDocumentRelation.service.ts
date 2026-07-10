import { getBillingCanonicalState } from "../../src/workspace/utils/billingStateHelpers";

export const resolveTicketForInvoice = (invoice: any, tickets: any[]): any => {
  if (!invoice || !tickets || tickets.length === 0) return null;

  // 1. invoice.sourceTicketId
  if (invoice.sourceTicketId) {
    const found = tickets.find(t => t.id === invoice.sourceTicketId);
    if (found) return found;
  }

  // 2. invoice.ticketId
  if (invoice.ticketId) {
    const found = tickets.find(t => t.id === invoice.ticketId);
    if (found) return found;
  }

  // 3. invoice.ticketRef
  if (invoice.ticketRef) {
    const found = tickets.find(t => t.folio === invoice.ticketRef || t.portalFields?.billingReference === invoice.ticketRef);
    if (found) return found;
  }

  // 4. invoice.relatedTicketId
  if (invoice.relatedTicketId) {
    const found = tickets.find(t => t.id === invoice.relatedTicketId);
    if (found) return found;
  }

  // 5. invoice.metadata.ticketId
  if (invoice.metadata?.ticketId) {
    const found = tickets.find(t => t.id === invoice.metadata.ticketId);
    if (found) return found;
  }

  // 6. Matching by invoiceId inside ticket
  const foundByInvId = tickets.find(t => 
    t.invoiceId === invoice.id || 
    (invoice.uuid && t.invoiceId === invoice.uuid) || 
    (invoice.folioFiscal && t.invoiceId === invoice.folioFiscal)
  );
  if (foundByInvId) return foundByInvId;

  // 7. Normalised reference match (last resort)
  const cleanKey = (val: any): string => {
    if (typeof val !== "string") return "";
    return val.trim().toUpperCase().replace(/\s+/g, "").replace(/^(TICKET#|FOLIO#|SYN-|INV-FALLBACK-|INV-)/, "");
  };
  const refA = invoice.reference || invoice.ticketNumber || invoice.ticketId || "";
  const cleanedA = cleanKey(refA);
  if (cleanedA) {
    const found = tickets.find(t => {
      const refB = t.reference || t.ticketNumber || t.ticketId || t.folio || "";
      const cleanedB = cleanKey(refB);
      return cleanedA === cleanedB;
    });
    if (found) return found;
  }

  return null;
};

export const isInvoiceLinkedToDeletedTicket = (invoice: any, ticket: any): boolean => {
  if (invoice?.linkedTicketDeleted === true) return true;
  if (ticket) {
    if (ticket.status === "deleted" || ticket.deletedAt) return true;
    if (ticket.hiddenFromUser === true) return true;
  }
  return false;
};

export const isRootInvoiceLegacy = (invoice: any): boolean => {
  if (!invoice) return false;
  const isRoot = invoice._path ? invoice._path.split("/").length === 2 : false;
  if (!isRoot) return false;
  if (invoice.legacyRootInvoice === true || invoice.mirroredToUserSubcollection === true) return true;
  return false;
};

export const shouldRootInvoiceCountAsActive = (invoice: any, ticket: any): boolean => {
  if (!invoice) return false;
  const isRoot = invoice._path ? invoice._path.split("/").length === 2 : false;
  if (!isRoot) return true;

  if (invoice.legacyRootInvoice === true || invoice.hiddenFromUser === true || invoice.linkedTicketDeleted === true) {
    return false;
  }

  if (!ticket) return false;
  if (ticket.status === "deleted" || ticket.deletedAt || ticket.hiddenFromUser === true) {
    return false;
  }

  return true;
};

export const shouldRootInvoiceBeArchived = (invoice: any, ticket: any): boolean => {
  if (!invoice) return false;
  const isRoot = invoice._path ? invoice._path.split("/").length === 2 : false;
  if (!isRoot) return false;

  if (invoice.legacyRootInvoice === true || invoice.hiddenFromUser === true || invoice.linkedTicketDeleted === true) {
    return true;
  }

  if (!ticket || ticket.status === "deleted" || ticket.deletedAt || ticket.hiddenFromUser === true) {
    return true;
  }

  return false;
};
