import nodemailer from "nodemailer";

interface InvoiceEmailPayload {
  to: string;
  invoice: any;
}

const DEFAULT_SENDER_EMAIL = "contacto@zenticket.mx";
const DEFAULT_SENDER_NAME = "ZenTicket";

export async function sendInvoiceEmail({ to, invoice }: InvoiceEmailPayload) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER || DEFAULT_SENDER_EMAIL;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn("SMTP credentials not fully set up in .env files. Simulated successful email send to: ", to);
    return {
      success: true,
      simulated: true,
      message: `[Simulacion] Factura de ${invoice.nombreEmisor} enviada con exito a ${to}.`,
    };
  }

  const transporter = nodemailer.createTransport({
    host,
    port: parseInt(port || "465", 10),
    secure: port === "465",
    auth: { user, pass },
  });

  const mailOptions = {
    from: `"${DEFAULT_SENDER_NAME}" <${DEFAULT_SENDER_EMAIL}>`,
    sender: `${DEFAULT_SENDER_NAME} <${user}>`,
    to,
    subject: `FactuBot MX - Tu CFDI 4.0 de ${invoice.nombreEmisor} esta listo`,
    html: `
      <div style="font-family: system-ui, -apple-system, sans-serif; background-color: #0c0a09; color: #f4f4f5; padding: 40px 20px; text-align: center;">
        <div style="max-width: 650px; margin: 0 auto; background-color: #1c1917; border: 1px solid #292524; border-radius: 20px; padding: 30px; text-align: left; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
            <span style="font-size: 24px; font-weight: 800; color: #6366f1;">FactuBot MX</span>
          </div>
          <h2 style="font-size: 18px; font-weight: 750; color: #ffffff; text-transform: uppercase;">Tu Factura Digital ha sido emitida</h2>
          <p style="font-size: 13px; color: #a1a1aa; line-height: 1.6;">
            La inyeccion automatizada de tu ticket con folio fiscal <strong>${invoice.folioFiscal}</strong> ha finalizado exitosamente.
          </p>
          <div style="margin: 24px 0; padding: 16px; background-color: #09090b; border: 1px solid #1c1917; border-radius: 12px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; color: #d4d4d8;">
              <tr>
                <td style="padding: 6px 0; color: #71717a; font-weight: 600; text-transform: uppercase;">EMISOR</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #ffffff; text-transform: uppercase;">${invoice.nombreEmisor}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #71717a; font-weight: 600; text-transform: uppercase;">RFC EMISOR</td>
                <td style="padding: 6px 0; text-align: right; font-family: monospace; color: #ffffff;">${invoice.rfcEmisor}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #71717a; font-weight: 600; text-transform: uppercase;">RECEPTOR</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #ffffff; text-transform: uppercase;">${invoice.nombreReceptor || "Configurado"}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #71717a; font-weight: 600; text-transform: uppercase;">RFC RECEPTOR</td>
                <td style="padding: 6px 0; text-align: right; font-family: monospace; color: #ffffff;">${invoice.rfcReceptor || "Configurado"}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #71717a; font-weight: 600; text-transform: uppercase;">TOTAL</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #10b981; font-size: 14px;">$${Number(invoice.total || 0).toFixed(2)} MXN</td>
              </tr>
            </table>
          </div>
          <p style="font-size: 13px; color: #a1a1aa; line-height: 1.6;">
            Hemos adjuntado el comprobante timbrado en formato XML para tu contabilidad inmediata. A continuacion tienes la representacion visual:
          </p>
          <div style="margin-top: 30px; border-top: 1px solid #292524; padding-top: 20px; color: #1c1917; background-color: #ffffff; border-radius: 12px; padding: 15px;">
            ${invoice.pdfHtml || "<!-- Visual HTML empty -->"}
          </div>
          <p style="font-size: 11px; color: #52525b; text-align: center; margin-top: 40px; border-top: 1px solid #292524; padding-top: 15px;">
            Este es un correo electronico generado automaticamente por FactuBot MX.
          </p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: `Factura_${invoice.nombreEmisor.replace(/[^a-zA-Z0-9]/g, "")}_${invoice.folioFiscal.substring(0, 8)}.xml`,
        content: invoice.xmlContent,
        contentType: "text/xml",
      },
    ],
  };

  await transporter.sendMail(mailOptions);
  return { success: true, simulated: false, message: `Email enviado exitosamente a ${to}.` };
}
