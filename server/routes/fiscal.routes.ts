import type { Express, Request, Response } from "express";
import { parseFiscalConstancia } from "../services/fiscal/fiscalConstanciaService";

export function registerFiscalRoutes(app: Express) {
  app.post("/api/fiscal/parse-constancia", async (req: Request, res: Response): Promise<void> => {
    try {
      const { file, mimeType } = req.body;
      const customKey = req.headers["x-gemini-api-key"] as string | undefined;

      if (!file) {
        res.status(400).json({ error: "Falta el archivo base64 de la constancia fiscal" });
        return;
      }

      res.json(await parseFiscalConstancia({ file, mimeType, customKey }));
    } catch (error: any) {
      console.error("Constancia processing error:", error);
      res.status(500).json({ error: "Error interno al procesar constancia fiscal" });
    }
  });
}
