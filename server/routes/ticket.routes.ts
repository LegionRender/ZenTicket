import type { Express, Request, Response } from "express";
import { analyzeTicketImage } from "../services/tickets/ticketOcrService";

export function registerTicketRoutes(app: Express) {
  app.post("/api/tickets/analyze", async (req: Request, res: Response): Promise<void> => {
    const { image, mimeType } = req.body;
    const customKey = req.headers["x-gemini-api-key"] as string | undefined;

    if (!image) {
      res.status(400).json({ error: "Missing base64 ticket image" });
      return;
    }

    res.json(await analyzeTicketImage({ image, mimeType, customKey }));
  });
}
