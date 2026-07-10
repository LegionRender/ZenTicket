import { z } from "zod";

export const proposedConnectorChangesSchema = z.object({
  connectorId: z.string(),
  type: z.enum([
    "field_mapping",
    "recovery_flow",
    "selector_update",
    "captcha_flow",
    "download_detection",
    "error_classifier",
    "jit_learning_rule"
  ]),
  description: z.string(),
  riskLevel: z.enum(["low", "medium", "high"]),
  filesLikelyAffected: z.array(z.string()),
  pseudoPatch: z.string().optional(),
  testPlan: z.array(z.string())
});

export const recoveryFlowStepSchema = z.object({
  action: z.enum(["click", "fill", "waitForText", "download", "navigate", "extract", "validate"]),
  target: z.string(),
  value: z.string().optional(),
  expectedResult: z.string()
});

export const recoveryFlowProposalSchema = z.object({
  steps: z.array(recoveryFlowStepSchema)
});

export const connectorPatchProposalSchema = z.object({
  summary: z.string(),
  plainLanguageProblem: z.string(),
  stoppedAtStage: z.string(),
  likelyCause: z.string(),
  portalSpecificObservations: z.array(z.string()),
  suggestedFix: z.string(),
  recommendedActions: z.array(z.string()),
  proposedConnectorChanges: proposedConnectorChangesSchema,
  recoveryFlowProposal: recoveryFlowProposalSchema.optional(),
  confidence: z.number().min(0).max(1),
  requiresHumanReview: z.literal(true),
  forbiddenActionsDetected: z.array(z.string())
});
