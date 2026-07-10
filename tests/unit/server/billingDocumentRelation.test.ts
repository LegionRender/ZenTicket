import { describe, it, expect } from "vitest";
import {
  resolveTicketForInvoice,
  shouldRootInvoiceCountAsActive,
  shouldRootInvoiceBeArchived
} from "../../../server/services/billingDocumentRelation.service";
import { buildUserTicketsView } from "../../../src/workspace/utils/billingStateHelpers";

describe("billingDocumentRelation - Ticket Matching Priority List", () => {
  const tickets = [
    { id: "T1", folio: "F1", portalFields: { billingReference: "REF1" }, invoiceId: "I1" },
    { id: "T2", folio: "F2", portalFields: { billingReference: "REF2" }, invoiceId: "I2" }
  ];

  it("should match by sourceTicketId", () => {
    const invoice = { id: "I100", sourceTicketId: "T1", ticketId: "T2" };
    const matched = resolveTicketForInvoice(invoice, tickets);
    expect(matched.id).toBe("T1");
  });

  it("should match by ticketId", () => {
    const invoice = { id: "I100", ticketId: "T2" };
    const matched = resolveTicketForInvoice(invoice, tickets);
    expect(matched.id).toBe("T2");
  });

  it("should match by ticketRef", () => {
    const invoice = { id: "I100", ticketRef: "REF1" };
    const matched = resolveTicketForInvoice(invoice, tickets);
    expect(matched.id).toBe("T1");
  });

  it("should match by invoiceId inside ticket", () => {
    const invoice = { id: "I2" };
    const matched = resolveTicketForInvoice(invoice, tickets);
    expect(matched.id).toBe("T2");
  });

  it("should match by normalized reference as last resort", () => {
    const invoice = { id: "I100", reference: "INV-F2" };
    const matched = resolveTicketForInvoice(invoice, tickets);
    expect(matched.id).toBe("T2");
  });
});

describe("billingDocumentRelation - Root Invoice Logic", () => {
  it("should count root invoice as active if related ticket is active", () => {
    const invoice = { id: "I1", _path: "invoices/I1" };
    const ticket = { id: "T1", status: "requires_manual_review" };
    expect(shouldRootInvoiceCountAsActive(invoice, ticket)).toBe(true);
    expect(shouldRootInvoiceBeArchived(invoice, ticket)).toBe(false);
  });

  it("should NOT count root invoice as active if related ticket is deleted", () => {
    const invoice = { id: "I1", _path: "invoices/I1" };
    const ticket = { id: "T1", status: "deleted" };
    expect(shouldRootInvoiceCountAsActive(invoice, ticket)).toBe(false);
    expect(shouldRootInvoiceBeArchived(invoice, ticket)).toBe(true);
  });

  it("should NOT count root invoice as active if related ticket is hidden", () => {
    const invoice = { id: "I1", _path: "invoices/I1" };
    const ticket = { id: "T1", status: "requires_manual_review", hiddenFromUser: true };
    expect(shouldRootInvoiceCountAsActive(invoice, ticket)).toBe(false);
    expect(shouldRootInvoiceBeArchived(invoice, ticket)).toBe(true);
  });
});

describe("buildUserTicketsView - Legacy Root Invoices Bucketing", () => {
  it("should place legacy root invoices under archived and not increment active counts", () => {
    const rawTickets = [
      { id: "T_ACTIVE", status: "requires_manual_review", userId: "U1", folio: "100" },
      { id: "T_DELETED", status: "deleted", userId: "U1", folio: "200" }
    ];

    const rawInvoices = [
      // Real invoice for active ticket
      { id: "I_ACTIVE", userId: "U1", ticketId: "T_ACTIVE", _path: "users/U1/invoices/I_ACTIVE", status: "valid" },
      // Legacy root invoice for deleted ticket
      { id: "I_LEGACY", userId: "U1", ticketId: "T_DELETED", _path: "invoices/I_LEGACY", status: "valid" }
    ];

    const result = buildUserTicketsView({
      userId: "U1",
      userDisplayName: "User Test",
      userEmailMasked: "test@test.com",
      tickets: rawTickets,
      invoices: rawInvoices,
      jobs: []
    });

    // Verify counts: active ticket should be in attention, legacy root invoice should be in archived
    expect(result.counts.totalVisible).toBe(1); // Only active ticket
    expect(result.counts.attention).toBe(1);
    expect(result.counts.archived).toBe(1);

    // Verify item bucketing
    const legacyItem = result.items.find(x => x.invoiceId === "I_LEGACY");
    expect(legacyItem).toBeDefined();
    expect(legacyItem.bucket).toBe("archived");
    expect(legacyItem.sourceType).toBe("legacy_root");
  });
});
