import type { Express, Request, Response } from "express";
import { runTicketAutomation } from "../services/automation/automationService";

export function registerAutomationRoutes(app: Express) {
  app.post("/api/automation/run", async (req: Request, res: Response): Promise<void> => {
    const { ticket, profile, connector } = req.body;
    const customKey = req.headers["x-gemini-api-key"] as string | undefined;

    if (!ticket || !profile || !connector) {
      res.status(400).json({ error: "Missing ticket, profile, or connector data for automation" });
      return;
    }

    res.json(await runTicketAutomation({ ticket, profile, connector, customKey }));
  });
}
