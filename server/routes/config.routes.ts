import type { Express, Request, Response } from "express";
import { getConfigStatus } from "../services/config/configStatus";

export function registerConfigRoutes(app: Express) {
  app.get("/api/config/status", (req: Request, res: Response) => {
    res.json(getConfigStatus());
  });
}
