import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { 
  resolveConnectorId, 
  buildTransactionKey, 
  getTicketFolio, 
  getTicketTotal, 
  getTicketCommerce, 
  getTicketDate,
  KNOWN_CONNECTOR_IDENTITY_FIELDS 
} from "../../src/workspace/utils/billingStateHelpers";

const serviceAccountPath = path.resolve("serviceAccountKey.json");
if (getApps().length === 0) {
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    initializeApp({
      credential: cert(serviceAccount)
    });
  } else {
    initializeApp({
      projectId: "factubolt"
    });
  }
}

const db = getFirestore(undefined, "ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee");

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run") || !args.includes("--apply");

  console.log(`=== TICKET IDENTITY MIGRATION ===`);
  console.log(`Mode: ${dryRun ? "DRY-RUN (No writes)" : "APPLY (Writes enabled)"}\n`);

  // 1. Fetch connectors to resolve identity fields
  console.log("Fetching connectors...");
  const connectorsSnap = await db.collection("connectors").get();
  const connectorMap: Record<string, string[]> = {};
  connectorsSnap.forEach(doc => {
    const data = doc.data();
    const fields = data.identityFields || (data.extractionContract?.requiredPortalFields || []).map((f: any) => f.canonicalKey);
    if (Array.isArray(fields) && fields.length > 0) {
      connectorMap[doc.id] = fields;
    }
  });
  console.log(`Loaded ${Object.keys(connectorMap).length} connectors from DB.`);

  // 2. Fetch all tickets
  console.log("Fetching all tickets...");
  const ticketsSnap = await db.collection("tickets").get();
  const tickets = ticketsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
  console.log(`Found ${tickets.length} tickets in database.`);

  // Group tickets by userId
  const ticketsByUser: Record<string, any[]> = {};
  tickets.forEach(t => {
    const uId = t.userId || "";
    if (!ticketsByUser[uId]) ticketsByUser[uId] = [];
    ticketsByUser[uId].push(t);
  });

  const ticketUpdates: Record<string, any> = {};
  let totalGroups = 0;
  let totalDuplicatesFound = 0;

  for (const [userId, userTickets] of Object.entries(ticketsByUser)) {
    // Within each user, resolve connector, folio, total, and group potential siblings
    const groups: Array<{ canonical: any; members: any[]; connectorId: string }> = [];

    userTickets.forEach(t => {
      // Resolve connectorId
      const rawCommerce = getTicketCommerce(t) || "";
      const connId = resolveConnectorId(t.connectorId || rawCommerce);
      if (!connId) {
        // Skip ticket if commerce cannot be identified
        return;
      }

      const folio = getTicketFolio(t);
      const total = getTicketTotal(t);
      if (!folio || total === null) {
        // Skip ticket if identity fields are incomplete
        return;
      }

      // Try to find a group with same connectorId, folio, and total
      let foundGroup = groups.find(g => {
        const cFolio = getTicketFolio(g.canonical);
        const cTotal = getTicketTotal(g.canonical);
        return g.connectorId === connId && cFolio === folio && cTotal === total;
      });

      if (foundGroup) {
        foundGroup.members.push(t);
      } else {
        groups.push({ canonical: t, members: [t], connectorId: connId });
      }
    });

    // Consolidate each group
    for (const group of groups) {
      totalGroups++;
      // Sort members by createdAt ascending to find the oldest (canonical representative)
      group.members.sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeA - timeB;
      });

      const oldest = group.members[0];
      const canonicalTicketId = oldest.id;

      if (group.members.length > 1) {
        totalDuplicatesFound += (group.members.length - 1);
        console.log(`Duplicate Group for User ${userId.slice(0, 6)}: Folio ${getTicketFolio(oldest)}, Total ${getTicketTotal(oldest)}, Connector ${group.connectorId}`);
        group.members.forEach((m, idx) => {
          console.log(`  - [${idx === 0 ? "CANONICAL" : "MEMBER"}] Ticket ID: ${m.id}, Date: ${getTicketDate(m)}, Status: ${m.status}`);
        });
      }

      // Prepare updates for each member in the group
      for (const m of group.members) {
        const proposedSourceTicketId = canonicalTicketId;
        const proposedConnectorId = group.connectorId;
        
        // Build proposed transactionKey using conector's identityFields
        const idFields = connectorMap[group.connectorId] || KNOWN_CONNECTOR_IDENTITY_FIELDS[group.connectorId] || ["billingReference", "total", "fecha"];
        const proposedTransactionKey = buildTransactionKey({
          connectorId: group.connectorId,
          portalFields: m.portalFields || m,
          identityFields: idFields
        });

        // Determine if document needs update
        const needsUpdate = 
          m.sourceTicketId !== proposedSourceTicketId ||
          m.connectorId !== proposedConnectorId ||
          m.transactionKey !== proposedTransactionKey ||
          m.identityVersion !== 1;

        if (needsUpdate) {
          ticketUpdates[m.id] = {
            sourceTicketId: proposedSourceTicketId,
            connectorId: proposedConnectorId,
            transactionKey: proposedTransactionKey || null,
            identityVersion: 1
          };
        }
      }
    }
  }

  console.log(`\nProposed Ticket Updates count: ${Object.keys(ticketUpdates).length}`);
  if (Object.keys(ticketUpdates).length > 0) {
    console.log("Examples of proposed ticket updates:");
    Object.entries(ticketUpdates).slice(0, 5).forEach(([id, upd]) => {
      console.log(`  - Ticket ${id}:`, JSON.stringify(upd));
    });
  }

  // 3. Update invoice_jobs to point to the correct sourceTicketId
  console.log("\nFetching all invoice_jobs...");
  const jobsSnap = await db.collection("invoice_jobs").get();
  const jobUpdates: Record<string, any> = {};
  jobsSnap.forEach(docSnap => {
    const data = docSnap.data();
    const tId = data.ticketId;
    if (tId) {
      // Find proposed ticket state
      const targetTicket = tickets.find(t => t.id === tId);
      if (targetTicket) {
        // The sourceTicketId for the job should match the proposed sourceTicketId of its target ticket
        const proposedSource = ticketUpdates[tId]?.sourceTicketId || targetTicket.sourceTicketId || tId;
        const proposedConnector = ticketUpdates[tId]?.connectorId || targetTicket.connectorId || null;
        const proposedTxKey = ticketUpdates[tId]?.transactionKey || targetTicket.transactionKey || null;

        const needsJobUpdate = 
          data.sourceTicketId !== proposedSource ||
          data.connectorId !== proposedConnector ||
          data.transactionKey !== proposedTxKey;

        if (needsJobUpdate) {
          jobUpdates[docSnap.id] = {
            sourceTicketId: proposedSource,
            connectorId: proposedConnector,
            transactionKey: proposedTxKey
          };
        }
      }
    }
  });

  console.log(`Proposed Job Updates count: ${Object.keys(jobUpdates).length}`);

  // 4. Update diagnostic_summaries
  console.log("\nFetching all diagnostic_summaries...");
  const summariesSnap = await db.collection("diagnostic_summaries").get();
  const summaryUpdates: Record<string, any> = {};
  summariesSnap.forEach(docSnap => {
    const data = docSnap.data();
    const tId = data.ticketId;
    if (tId) {
      const targetTicket = tickets.find(t => t.id === tId);
      if (targetTicket) {
        const proposedSource = ticketUpdates[tId]?.sourceTicketId || targetTicket.sourceTicketId || tId;
        if (data.sourceTicketId !== proposedSource) {
          summaryUpdates[docSnap.id] = {
            sourceTicketId: proposedSource
          };
        }
      }
    }
  });

  console.log(`Proposed Summary Updates count: ${Object.keys(summaryUpdates).length}`);

  // 5. Apply changes if not dry-run
  if (dryRun) {
    console.log(`\n[DRY-RUN] No changes were written to the database.`);
  } else {
    console.log(`\n[APPLY] Writing updates to database...`);
    const batchSize = 200;
    let batch = db.batch();
    let count = 0;

    const commitBatch = async () => {
      if (count > 0) {
        await batch.commit();
        console.log(`Committed batch of ${count} writes.`);
        batch = db.batch();
        count = 0;
      }
    };

    // Write ticket updates
    for (const [id, upd] of Object.entries(ticketUpdates)) {
      const ref = db.collection("tickets").doc(id);
      batch.set(ref, upd, { merge: true });
      count++;
      if (count >= batchSize) await commitBatch();
    }

    // Write job updates
    for (const [id, upd] of Object.entries(jobUpdates)) {
      const ref = db.collection("invoice_jobs").doc(id);
      batch.set(ref, upd, { merge: true });
      count++;
      if (count >= batchSize) await commitBatch();
    }

    // Write summary updates
    for (const [id, upd] of Object.entries(summaryUpdates)) {
      const ref = db.collection("diagnostic_summaries").doc(id);
      batch.set(ref, upd, { merge: true });
      count++;
      if (count >= batchSize) await commitBatch();
    }

    await commitBatch();
    console.log("Migration write completed successfully!");
  }
}

main().catch(console.error);
