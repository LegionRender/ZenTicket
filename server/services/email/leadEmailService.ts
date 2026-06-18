import nodemailer from "nodemailer";
import type { StoredLead } from "../leads/leadsService";

interface LeadNotificationResult {
  success: boolean;
  simulated: boolean;
  message: string;
}

const DEFAULT_SENDER_EMAIL = "contacto@zenticket.mx";
const DEFAULT_SENDER_NAME = "ZenTicket";

function getLeadRecipient() {
  return process.env.LEADS_NOTIFICATION_TO || process.env.SMTP_USER || DEFAULT_SENDER_EMAIL;
}

export async function sendLeadNotificationEmail(lead: StoredLead): Promise<LeadNotificationResult> {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER || DEFAULT_SENDER_EMAIL;
  const pass = process.env.SMTP_PASS;
  const to = getLeadRecipient();

  if (!to) {
    console.warn("Lead notification recipient missing. Lead stored without email notification.");
    return {
      success: true,
      simulated: true,
      message: "Lead guardado sin notificacion: falta LEADS_NOTIFICATION_TO o SMTP_USER.",
    };
  }

  if (!host || !user || !pass) {
    console.warn("SMTP credentials not fully set up in .env files. Simulated lead notification email send to:", to);
    return {
      success: true,
      simulated: true,
      message: `[Simulacion] Lead de ${lead.name} notificado a ${to}.`,
    };
  }

  const transporter = nodemailer.createTransport({
    host,
    port: parseInt(port || "465", 10),
    secure: port === "465",
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `"${DEFAULT_SENDER_NAME}" <${DEFAULT_SENDER_EMAIL}>`,
    sender: `${DEFAULT_SENDER_NAME} <${user}>`,
    to,
    replyTo: lead.email,
    subject: `Nuevo lead ZenTicket - ${lead.plan}`,
    html: `
      <div style="font-family: system-ui, -apple-system, sans-serif; padding: 24px; color: #0f172a;">
        <h2 style="margin: 0 0 16px; font-size: 20px;">Nuevo lead recibido</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 560px;">
          <tr>
            <td style="padding: 8px 0; font-weight: 700;">Nombre</td>
            <td style="padding: 8px 0;">${lead.name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 700;">Correo</td>
            <td style="padding: 8px 0;">${lead.email}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 700;">Plan</td>
            <td style="padding: 8px 0;">${lead.plan}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 700;">Recibido</td>
            <td style="padding: 8px 0;">${lead.receivedAt}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 700;">ID</td>
            <td style="padding: 8px 0; font-family: monospace;">${lead.id}</td>
          </tr>
        </table>
      </div>
    `,
  });

  return {
    success: true,
    simulated: false,
    message: `Lead notificado por email a ${to}.`,
  };
}
