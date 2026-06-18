import type { Express, Request, Response } from "express";
import { createLead } from "../services/leads/leadsService";

export function registerLeadRoutes(app: Express) {
  app.post("/api/leads", async (req: Request, res: Response): Promise<void> => {
    try {
      res.status(202).json(await createLead(req.body));
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Invalid lead request." });
    }
  });
}
