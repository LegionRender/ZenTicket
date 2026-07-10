export const CONNECTOR_LEARNING_STATUSES = [
  'pending_review',
  'approved_for_sandbox',
  'approved_for_observation',
  'active',
  'disabled',
  'deprecated'
] as const;

export type ConnectorLearningStatus = typeof CONNECTOR_LEARNING_STATUSES[number];
