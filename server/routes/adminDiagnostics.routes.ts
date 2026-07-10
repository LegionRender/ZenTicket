import { Router } from "express";
import { adminDiagnosticsController } from "../controllers/adminDiagnostics.controller";
import { authenticateFirebaseToken } from "../middleware/auth.middleware";
import { requireAdmin } from "../middleware/admin.middleware";

const router = Router();

router.use(authenticateFirebaseToken, requireAdmin);

router.get("/", adminDiagnosticsController.listDiagnostics);
router.get("/debug/sources", adminDiagnosticsController.getDebugSources);

// Proposals management routes (must be registered before /:ticketId to avoid routing collision)
router.get("/proposals", adminDiagnosticsController.listProposals);
router.post("/proposals/:proposalId/approve-sandbox", adminDiagnosticsController.approveProposalSandbox);
router.post("/proposals/:proposalId/reject", adminDiagnosticsController.rejectProposal);
router.post("/proposals/:proposalId/request-revision", adminDiagnosticsController.requestRevisionProposal);
router.post("/proposals/:proposalId/promote-observation", adminDiagnosticsController.promoteProposalObservation);
router.post("/proposals/:proposalId/promote-active", adminDiagnosticsController.promoteProposalActive);

router.get("/:ticketId", adminDiagnosticsController.getDiagnosticDetail);
router.get("/:ticketId/screenshot", adminDiagnosticsController.getScreenshotUrl);
router.post("/:ticketId/retry", adminDiagnosticsController.retryDiagnostic);
router.post("/:ticketId/mark-reviewed", adminDiagnosticsController.markReviewed);
router.post("/:ticketId/archive", adminDiagnosticsController.archiveDiagnostic);
router.post("/:ticketId/create-connector-task", adminDiagnosticsController.createConnectorTask);
router.post("/:ticketId/propose-fix", adminDiagnosticsController.proposeFix);

// Catch-all 404 for this route group to respond in JSON format instead of HTML
router.use("*", (req, res) => {
  res.status(404).json({ error: "Ruta de diagnóstico no encontrada." });
});

export default router;
