import { ConnectorPatchProposal } from "./diagnostic-types";

export type PatchRiskLevel = 'low' | 'medium' | 'high';
export type ProposalStatus = 'pending_review' | 'approved' | 'rejected';
export type ProposedFixType = 'recoveryFlow' | 'fieldMapping' | 'selectorFix' | 'connectorStrategyHook' | 'captchaHandling' | 'manualReviewOnly';
