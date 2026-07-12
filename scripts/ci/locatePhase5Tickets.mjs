import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) throw new Error("PROJECT_ID is required.");
const configPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../firebase-applet-config.json");
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
const app = initializeApp({ credential: applicationDefault(), projectId });
const db = config.firestoreDatabaseId ? getFirestore(app, config.firestoreDatabaseId) : getFirestore(app);
const identifiers = ["486267", "TS#050726155547"];

const tickets = await db.collection("tickets").limit(1000).get();
const matches = tickets.docs.filter((ticket) => {
  const serialized = JSON.stringify(ticket.data()).toUpperCase();
  return identifiers.some((identifier) => serialized.includes(identifier)) ||
    /OXXO|BODEGA\s*AURRERA|NUEVA\s*WAL\s*MART/.test(serialized);
});
const ticketIds = new Set(matches.map((ticket) => ticket.id));
const jobs = await db.collection("invoice_jobs").limit(1000).get();
const jobByTicket = new Map();
for (const job of jobs.docs) {
  const data = job.data();
  if (ticketIds.has(String(data.ticketId || ""))) jobByTicket.set(String(data.ticketId), { id: job.id, ...data });
}

console.log(JSON.stringify({
  tickets: matches.map((ticket) => {
    const data = ticket.data();
    const job = jobByTicket.get(ticket.id);
    return {
      ticketId: ticket.id,
      status: data.status || null,
      connectorId: data.connectorId || null,
      portalMapId: data.portalMapId || null,
      jobId: job?.id || null,
      jobStatus: job?.status || null,
      issuer: data.nombreEmisor || data.ticketData?.nombreEmisor || null,
      total: data.total || data.expectedTicketTotal || data.ticketData?.total || null,
      purchaseDate: data.fechaCompra || data.ticketData?.fechaCompra || null
    };
  })
}));
