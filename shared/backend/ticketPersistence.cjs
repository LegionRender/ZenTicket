function normalizeReference(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+/, "");
}

function normalizeDate(value) {
  return String(value || "").slice(0, 10);
}

function normalizeTotal(value) {
  const total = Number.parseFloat(String(value));
  return Number.isFinite(total) ? Number.parseFloat(total.toFixed(2)) : 0;
}

async function persistTicket({ db, userId, ticketData, idempotencyKey }) {
  if (!db) {
    const error = new Error("Base de datos no inicializada");
    error.status = 500;
    throw error;
  }
  if (!userId) {
    const error = new Error("No autorizado.");
    error.status = 401;
    throw error;
  }

  const payload = ticketData && typeof ticketData === "object" ? ticketData : {};
  const requestKey = String(idempotencyKey || payload.clientRequestId || "");
  const reference = payload.portalFields?.billingReference || payload.reference || payload.folio || "";
  const rfcEmisor = payload.rfcEmisor || "";
  const purchaseDate = payload.fechaCompra || payload.fecha || "";
  const total = normalizeTotal(payload.total);
  let resolvedTicketId = "";

  await db.runTransaction(async (transaction) => {
    const ticketsQuery = db.collection("tickets").where("userId", "==", userId);
    const querySnap = await transaction.get(ticketsQuery);
    const activeTickets = querySnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    if (requestKey) {
      const existing = activeTickets.find((ticket) => ticket.clientRequestId === requestKey);
      if (existing) {
        resolvedTicketId = existing.id;
        return;
      }
    }

    const normalizedReference = normalizeReference(reference);
    const normalizedRfc = String(rfcEmisor).toUpperCase().trim();
    const normalizedDate = normalizeDate(purchaseDate);
    const hasPurchaseFingerprint = normalizedReference && normalizedRfc && normalizedDate && total > 0;

    if (hasPurchaseFingerprint) {
      const matchingTicket = activeTickets.find((ticket) => {
        if (ticket.status === "deleted" || ticket.deletedAt) return false;
        const ticketReference = ticket.portalFields?.billingReference || ticket.reference || ticket.folio || "";
        return normalizeReference(ticketReference) === normalizedReference &&
          String(ticket.rfcEmisor || "").toUpperCase().trim() === normalizedRfc &&
          normalizeDate(ticket.fechaCompra || ticket.fecha) === normalizedDate &&
          normalizeTotal(ticket.total) === total;
      });

      if (matchingTicket) {
        resolvedTicketId = matchingTicket.id;
        transaction.update(db.collection("tickets").doc(matchingTicket.id), {
          ...payload,
          clientRequestId: requestKey || matchingTicket.clientRequestId || null,
          updatedAt: new Date().toISOString()
        });
        return;
      }
    }

    const ticketRef = db.collection("tickets").doc();
    const now = new Date().toISOString();
    transaction.set(ticketRef, {
      ...payload,
      id: ticketRef.id,
      userId,
      clientRequestId: requestKey || null,
      createdAt: payload.createdAt || now,
      updatedAt: now
    });
    resolvedTicketId = ticketRef.id;
  });

  return { id: resolvedTicketId };
}

module.exports = { persistTicket };
