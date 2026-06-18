import type { Express, Request, Response } from "express";
import { learnConnectorSpecs } from "../services/connectors/connectorLearningService";

export function registerConnectorRoutes(app: Express) {
  app.post("/api/connectors/learn", async (req: Request, res: Response): Promise<void> => {
    const { nombreEmisor, rfcEmisor, learnedFrom, tokenSaver } = req.body;
    const customKey = req.headers["x-gemini-api-key"] as string | undefined;

    if (!nombreEmisor) {
      res.status(400).json({ error: "Missing nombreEmisor in request" });
      return;
    }

    res.json(await learnConnectorSpecs({ nombreEmisor, rfcEmisor, learnedFrom, tokenSaver, customKey }));
  });
}
