import { db } from "@/services/firebase/client";
import { collection, doc, setDoc } from "firebase/firestore";

export async function createInvoice(user, fiscalProfile, invoiceData) {
  const invoicePayload = {
    userId: user.uid,
    ticketId: invoiceData.ticketId,
    folioFiscal: invoiceData.uuid,
    rfcEmisor: invoiceData.emisorRfc.toUpperCase(),
    nombreEmisor: invoiceData.emisorName.toUpperCase(),
    rfcReceptor: fiscalProfile?.rfc || "CABE850101ABC",
    nombreReceptor: fiscalProfile?.razonSocial || "RICARDO CASTRO BECERRIL",
    total: parseFloat(invoiceData.total.toString()),
    xmlContent: invoiceData.xml,
    pdfHtml: invoiceData.pdf,
    createdAt: new Date().toISOString(),
    cost: invoiceData.cost ?? 2.5,
    rawCost: invoiceData.rawCost ?? 0.0016,
    connectorType: invoiceData.connectorType ?? "existente"
  };

  const invoiceRef = doc(collection(db, "invoices"));
  await setDoc(invoiceRef, invoicePayload);
  return { id: invoiceRef.id, ...invoicePayload };
}
