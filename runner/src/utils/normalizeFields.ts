export interface NormalizedFields {
  folio: string | null;
  itu: string | null;
  total: number | null;
  fechaCompra: string | null;
  fechaOriginal: string | null;
  fechaFuente: string | null;
  rfcReceptor: string | null;
  email: string | null;
  sourceMap: {
    folio: string | null;
    itu: string | null;
    total: string | null;
    fechaCompra: string | null;
    rfcReceptor: string | null;
    email: string | null;
  };
  rawCandidates: {
    folio: any[];
    itu: any[];
    total: any[];
    fechaCompra: any[];
    rfcReceptor: any[];
    email: any[];
  };
}

export function normalizeBillingAttemptFields(
  ticket: any,
  invoice?: any,
  fiscalProfile?: any,
  portalMap?: any
): NormalizedFields {
  const t = ticket ?? {};
  const inv = invoice ?? {};
  const fp = fiscalProfile ?? {};
  const pm = portalMap ?? {};

  // Folio candidates in order of priority:
  const folioCandidates = [
    { value: t.portalFields?.folio, source: "ticket.portalFields.folio" },
    { value: t.portalFields?.billingReference, source: "ticket.portalFields.billingReference" },
    { value: t.reference, source: "ticket.reference" },
    { value: t.ticketNumber, source: "ticket.ticketNumber" },
    { value: inv.uuid, source: "invoice.uuid" },
    { value: inv.folioFiscal, source: "invoice.folioFiscal" }
  ];

  let folio: string | null = null;
  let folioSource: string | null = null;
  for (const c of folioCandidates) {
    if (c.value !== undefined && c.value !== null && String(c.value).trim() !== "") {
      folio = String(c.value).trim();
      folioSource = c.source;
      break;
    }
  }

  // ITU candidates:
  const ituCandidates = [
    { value: t.portalFields?.itu, source: "ticket.portalFields.itu" },
    { value: t.portalFields?.ituId, source: "ticket.portalFields.ituId" },
    { value: t.portalFields?.idVenta, source: "ticket.portalFields.idVenta" },
    { value: t.portalFields?.venta, source: "ticket.portalFields.venta" }
  ];

  let itu: string | null = null;
  let ituSource: string | null = null;
  for (const c of ituCandidates) {
    if (c.value !== undefined && c.value !== null && String(c.value).trim() !== "") {
      itu = String(c.value).trim();
      ituSource = c.source;
      break;
    }
  }

  // Total candidates:
  const totalCandidates = [
    { value: t.portalFields?.totalAmount, source: "ticket.portalFields.totalAmount" },
    { value: t.portalFields?.total, source: "ticket.portalFields.total" },
    { value: t.expectedTicketTotal, source: "ticket.expectedTicketTotal" },
    { value: t.total, source: "ticket.total" },
    { value: inv.total, source: "invoice.total" }
  ];

  let total: number | null = null;
  let totalSource: string | null = null;
  for (const c of totalCandidates) {
    if (c.value !== undefined && c.value !== null && c.value !== "") {
      const parsed = parseFloat(String(c.value));
      if (!isNaN(parsed)) {
        total = parsed;
        totalSource = c.source;
        break;
      }
    }
  }

  // fechaCompra candidates:
  const fechaCandidates = [
    { value: t.portalFields?.fechaCompra, source: "ticket.portalFields.fechaCompra" },
    { value: t.portalFields?.fecha, source: "ticket.portalFields.fecha" },
    { value: t.purchaseDate, source: "ticket.purchaseDate" },
    { value: t.ticketDate, source: "ticket.ticketDate" },
    { value: t.fechaCompra, source: "ticket.fechaCompra" },
    { value: t.createdAt, source: "ticket.createdAt" }
  ];

  let fechaOriginal: string | null = null;
  let fechaCompra: string | null = null;
  let fechaFuente: string | null = null;

  for (const c of fechaCandidates) {
    if (c.value !== undefined && c.value !== null && String(c.value).trim() !== "") {
      const rawVal = String(c.value).trim();
      let normalized: string | null = null;
      
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawVal)) {
        normalized = rawVal;
      } else {
        const parts = rawVal.split(/[/-]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            normalized = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          } else if (parts[2].length === 4) {
            normalized = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        }
      }

      if (!normalized) {
        const d = new Date(rawVal);
        if (!isNaN(d.getTime())) {
          normalized = d.toISOString().split('T')[0];
        }
      }

      if (normalized) {
        fechaCompra = normalized;
        fechaOriginal = rawVal;
        fechaFuente = c.source;
        break;
      }
    }
  }

  // rfcReceptor candidates:
  const rfcCandidates = [
    { value: t.rfcReceptor, source: "ticket.rfcReceptor" },
    { value: t.portalFields?.rfcReceptor, source: "ticket.portalFields.rfcReceptor" },
    { value: fp.rfc, source: "fiscalProfile.rfc" },
    { value: inv.rfcReceptor, source: "invoice.rfcReceptor" }
  ];

  let rfcReceptor: string | null = null;
  let rfcSource: string | null = null;
  for (const c of rfcCandidates) {
    if (c.value !== undefined && c.value !== null && String(c.value).trim() !== "") {
      rfcReceptor = String(c.value).trim().toUpperCase();
      rfcSource = c.source;
      break;
    }
  }

  // email candidates:
  const emailCandidates = [
    { value: t.portalFields?.email, source: "ticket.portalFields.email" },
    { value: fp.email, source: "fiscalProfile.email" },
    { value: fp.correoElectronico, source: "fiscalProfile.correoElectronico" }
  ];

  let email: string | null = null;
  let emailSource: string | null = null;
  for (const c of emailCandidates) {
    if (c.value !== undefined && c.value !== null && String(c.value).trim() !== "") {
      email = String(c.value).trim();
      emailSource = c.source;
      break;
    }
  }

  return {
    folio,
    itu,
    total,
    fechaCompra,
    fechaOriginal,
    fechaFuente,
    rfcReceptor,
    email,
    sourceMap: {
      folio: folioSource,
      itu: ituSource,
      total: totalSource,
      fechaCompra: fechaFuente,
      rfcReceptor: rfcSource,
      email: emailSource
    },
    rawCandidates: {
      folio: folioCandidates.map(c => c.value),
      itu: ituCandidates.map(c => c.value),
      total: totalCandidates.map(c => c.value),
      fechaCompra: fechaCandidates.map(c => c.value),
      rfcReceptor: rfcCandidates.map(c => c.value),
      email: emailCandidates.map(c => c.value)
    }
  };
}
