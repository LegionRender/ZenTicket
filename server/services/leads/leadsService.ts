import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sendLeadNotificationEmail } from "../email/leadEmailService";

export interface CreateLeadInput {
  name?: string;
  email?: string;
  plan?: string;
}

export interface StoredLead {
  id: string;
  name: string;
  email: string;
  plan: string;
  status: "new";
  source: "lead_modal";
  receivedAt: string;
}

export interface CreateLeadResult {
  accepted: true;
  duplicate: boolean;
  lead: StoredLead;
  notification: {
    success: boolean;
    simulated: boolean;
    message: string;
  };
}

const leadsDir = path.join(process.cwd(), "server", "data");
const leadsFile = path.join(leadsDir, "leads.json");

function assertValidEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invalid lead email.");
  }
}

async function ensureLeadsFile() {
  await mkdir(leadsDir, { recursive: true });

  try {
    await readFile(leadsFile, "utf8");
  } catch {
    await writeFile(leadsFile, "[]\n", "utf8");
  }
}

async function readLeads(): Promise<StoredLead[]> {
  await ensureLeadsFile();
  const raw = await readFile(leadsFile, "utf8");

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveLeads(leads: StoredLead[]) {
  await writeFile(leadsFile, `${JSON.stringify(leads, null, 2)}\n`, "utf8");
}

function buildLead(input: CreateLeadInput): StoredLead {
  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  const plan = input.plan?.trim() || "general";

  if (!name || !email) {
    throw new Error("Missing lead name or email.");
  }

  assertValidEmail(email);

  return {
    id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    email,
    plan,
    status: "new",
    source: "lead_modal",
    receivedAt: new Date().toISOString(),
  };
}

export async function createLead(input: CreateLeadInput): Promise<CreateLeadResult> {
  const existingLeads = await readLeads();
  const candidateLead = buildLead(input);
  const duplicateLead = existingLeads.find(
    (lead) => lead.email === candidateLead.email && lead.plan === candidateLead.plan,
  );

  if (duplicateLead) {
    return {
      accepted: true,
      duplicate: true,
      lead: duplicateLead,
      notification: {
        success: true,
        simulated: true,
        message: `Lead existente reutilizado para ${duplicateLead.email} en plan ${duplicateLead.plan}.`,
      },
    };
  }

  const lead = candidateLead;
  existingLeads.unshift(lead);
  await saveLeads(existingLeads);

  const notification = await sendLeadNotificationEmail(lead);

  return {
    accepted: true,
    duplicate: false,
    lead,
    notification,
  };
}
