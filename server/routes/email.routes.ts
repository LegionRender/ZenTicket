import type { Express, Request, Response } from "express";
import { sendInvoiceEmail } from "../services/email/invoiceEmailService";

export function registerEmailRoutes(app: Express) {
  app.post("/api/email/send", async (req: Request, res: Response): Promise<void> => {
    const { to, invoice } = req.body;

    if (!to || !invoice) {
      res.status(400).json({ error: "Missing 'to' email or 'invoice' body in request." });
      return;
    }

    try {
      res.json(await sendInvoiceEmail({ to, invoice }));
    } catch (err: any) {
      console.error("Mail dispatch error:", err);
      res.status(500).json({ error: `Fallo al despachar email de factura por SMTP: ${err.message}` });
    }
  });
}
