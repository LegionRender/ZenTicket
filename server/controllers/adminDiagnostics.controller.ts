import { Request, Response } from "express";
import { adminDiagnosticsService } from "../services/adminDiagnostics.service";
import { 
  listDiagnosticsSchema, 
  getDiagnosticDetailSchema, 
  markReviewedSchema, 
  createConnectorTaskSchema, 
  proposeFixSchema,
  proposalActionSchema,
  listProposalsSchema,
  archiveDiagnosticSchema
} from "../schemas/adminDiagnostics.schema";
import { connectorLearningService } from "../services/connectorLearning.service";

export class AdminDiagnosticsController {
  async listDiagnostics(req: Request, res: Response) {
    try {
      const parsed = listDiagnosticsSchema.parse({ query: req.query });
      const result = await adminDiagnosticsService.listDiagnostics(parsed.query);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || err.toString() });
    }
  }

  async getDiagnosticDetail(req: Request, res: Response) {
    try {
      const parsed = getDiagnosticDetailSchema.parse({ params: req.params });
      const result = await adminDiagnosticsService.getDiagnosticDetail(parsed.params.ticketId);
      if (!result) {
        res.status(404).json({ error: "Diagnóstico no encontrado." });
        return;
      }
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || err.toString() });
    }
  }

  async retryDiagnostic(req: Request, res: Response) {
    try {
      const parsed = getDiagnosticDetailSchema.parse({ params: req.params });
      const adminUser = (req as any).user;
      const result = await adminDiagnosticsService.retryDiagnostic(parsed.params.ticketId, adminUser);
      res.json(result);
    } catch (err: any) {
      if (err.message === "TICKET_NOT_FOUND") {
        res.status(404).json({ error: "Ticket no encontrado." });
      } else if (err.message === "ALREADY_SAT_VALIDATED") {
        res.status(400).json({ error: "El ticket ya cuenta con una factura real validada ante el SAT." });
      } else {
        res.status(500).json({ error: err.message || err.toString() });
      }
    }
  }

  async markReviewed(req: Request, res: Response) {
    try {
      const parsed = markReviewedSchema.parse({ params: req.params, body: req.body });
      const adminUser = (req as any).user;
      const result = await adminDiagnosticsService.markReviewed(
        parsed.params.ticketId, 
        parsed.body.note, 
        adminUser
      );
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || err.toString() });
    }
  }

  async archiveDiagnostic(req: Request, res: Response) {
    try {
      const parsed = archiveDiagnosticSchema.parse({ params: req.params, body: req.body });
      const adminUser = (req as any).user;
      const result = await adminDiagnosticsService.archiveDiagnostic(
        parsed.params.ticketId,
        parsed.body.reason,
        parsed.body.comment,
        adminUser
      );
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || err.toString() });
    }
  }

  async getScreenshotUrl(req: Request, res: Response) {
    try {
      const parsed = getDiagnosticDetailSchema.parse({ params: req.params });
      const url = await adminDiagnosticsService.getScreenshotSignedUrl(parsed.params.ticketId);
      res.json({ url });
    } catch (err: any) {
      if (err.message === "SCREENSHOT_NOT_FOUND" || err.message === "SCREENSHOT_FILE_DOES_NOT_EXIST") {
        res.status(404).json({ error: "Captura de pantalla no disponible en Storage." });
      } else {
        res.status(err.message === "TICKET_NOT_FOUND" ? 404 : 500).json({ error: err.message || err.toString() });
      }
    }
  }

  async createConnectorTask(req: Request, res: Response) {
    try {
      const parsed = createConnectorTaskSchema.parse({ params: req.params });
      const adminUser = (req as any).user;
      const result = await adminDiagnosticsService.createConnectorTask(parsed.params.ticketId, adminUser);
      res.json(result);
    } catch (err: any) {
      if (err.message === "TICKET_NOT_FOUND") {
        res.status(404).json({ error: "Ticket no encontrado." });
      } else {
        res.status(500).json({ error: err.message || err.toString() });
      }
    }
  }

  async proposeFix(req: Request, res: Response) {
    try {
      const parsed = proposeFixSchema.parse({ params: req.params });
      const adminUser = (req as any).user;
      const result = await adminDiagnosticsService.prepareFixProposal(parsed.params.ticketId, adminUser);
      res.json(result);
    } catch (err: any) {
      if (err.message === "GEMINI_DIAGNOSTIC_DISABLED") {
        res.status(503).json({ error: "Gemini no está habilitado para diagnóstico." });
      } else if (
        err.message === "DAILY_BUDGET_EXCEEDED" ||
        err.message === "MONTHLY_BUDGET_EXCEEDED" ||
        err.message === "TICKET_BUDGET_EXCEEDED"
      ) {
        res.status(429).json({ error: `Límite de solicitudes AI superado: ${err.message}` });
      } else if (err.message === "AI_PROPOSAL_REJECTED_FORBIDDEN_ACTIONS") {
        res.status(400).json({ error: "Propuesta de parche rechazada por detectar acciones prohibidas." });
      } else {
        res.status(500).json({ error: err.message || err.toString() });
      }
    }
  }

  async getDebugSources(req: Request, res: Response) {
    try {
      const result = await adminDiagnosticsService.getDebugSources(req.query);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || err.toString() });
    }
  }

  async listProposals(req: Request, res: Response) {
    try {
      const parsed = listProposalsSchema.parse({ query: req.query });
      const result = await connectorLearningService.listPatchProposals(parsed.query);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || err.toString() });
    }
  }

  async approveProposalSandbox(req: Request, res: Response) {
    try {
      const parsed = proposalActionSchema.parse({ params: req.params, body: req.body });
      const adminUser = (req as any).user;
      await connectorLearningService.approveForSandbox(parsed.params.proposalId, adminUser);
      res.json({ success: true });
    } catch (err: any) {
      res.status(err.message === "PROPOSAL_NOT_FOUND" ? 404 : 500).json({ error: err.message || err.toString() });
    }
  }

  async rejectProposal(req: Request, res: Response) {
    try {
      const parsed = proposalActionSchema.parse({ params: req.params, body: req.body });
      const adminUser = (req as any).user;
      await connectorLearningService.rejectProposal(parsed.params.proposalId, adminUser);
      res.json({ success: true });
    } catch (err: any) {
      res.status(err.message === "PROPOSAL_NOT_FOUND" ? 404 : 500).json({ error: err.message || err.toString() });
    }
  }

  async requestRevisionProposal(req: Request, res: Response) {
    try {
      const parsed = proposalActionSchema.parse({ params: req.params, body: req.body });
      const adminUser = (req as any).user;
      const comment = parsed.body?.comment || "Revision requested by admin";
      await connectorLearningService.requestRevision(parsed.params.proposalId, comment, adminUser);
      res.json({ success: true });
    } catch (err: any) {
      res.status(err.message === "PROPOSAL_NOT_FOUND" ? 404 : 500).json({ error: err.message || err.toString() });
    }
  }

  async promoteProposalObservation(req: Request, res: Response) {
    try {
      const parsed = proposalActionSchema.parse({ params: req.params, body: req.body });
      const adminUser = (req as any).user;
      await connectorLearningService.promoteToObservation(parsed.params.proposalId, adminUser);
      res.json({ success: true });
    } catch (err: any) {
      res.status(err.message === "PROPOSAL_NOT_FOUND" ? 404 : 500).json({ error: err.message || err.toString() });
    }
  }

  async promoteProposalActive(req: Request, res: Response) {
    try {
      const parsed = proposalActionSchema.parse({ params: req.params });
      const adminUser = (req as any).user;
      await connectorLearningService.promoteToActive(parsed.params.proposalId, adminUser);
      res.json({ success: true });
    } catch (err: any) {
      if (err.message === "CANNOT_PROMOTE_PENDING_DIRECTLY_TO_ACTIVE") {
        res.status(400).json({ error: "No se puede promover una propuesta directamente desde revisión a activa sin pasar por sandbox." });
      } else {
        res.status(err.message === "PROPOSAL_NOT_FOUND" ? 404 : 500).json({ error: err.message || err.toString() });
      }
    }
  }
}
export const adminDiagnosticsController = new AdminDiagnosticsController();
