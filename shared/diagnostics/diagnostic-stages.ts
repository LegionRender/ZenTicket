export type DiagnosticStage =
  | 'ticket_created'
  | 'ocr_started'
  | 'ocr_completed'
  | 'connector_match_started'
  | 'connector_found'
  | 'connector_missing'
  | 'portal_map_loaded'
  | 'field_normalization'
  | 'portal_navigation_started'
  | 'portal_loaded'
  | 'captcha_detected'
  | 'captcha_waiting_user'
  | 'fields_filled'
  | 'submit_attempted'
  | 'portal_response_received'
  | 'duplicate_detected'
  | 'invoice_recovery_started'
  | 'recovery_flow_started'
  | 'jit_recovery_started'
  | 'recovery_flow_completed'
  | 'xml_download_started'
  | 'xml_download_failed'
  | 'xml_downloaded'
  | 'pdf_downloaded'
  | 'xml_validation_started'
  | 'xml_validation_failed'
  | 'sat_validation_started'
  | 'sat_validation_failed'
  | 'sat_validated'
  | 'invoice_persisted'
  | 'ticket_completed'
  | 'manual_review_required'
  | 'failed_blocking';

export const DIAGNOSTIC_STAGES: DiagnosticStage[] = [
  'ticket_created',
  'ocr_started',
  'ocr_completed',
  'connector_match_started',
  'connector_found',
  'connector_missing',
  'portal_map_loaded',
  'field_normalization',
  'portal_navigation_started',
  'portal_loaded',
  'captcha_detected',
  'captcha_waiting_user',
  'fields_filled',
  'submit_attempted',
  'portal_response_received',
  'duplicate_detected',
  'invoice_recovery_started',
  'recovery_flow_started',
  'jit_recovery_started',
  'recovery_flow_completed',
  'xml_download_started',
  'xml_download_failed',
  'xml_downloaded',
  'pdf_downloaded',
  'xml_validation_started',
  'xml_validation_failed',
  'sat_validation_started',
  'sat_validation_failed',
  'sat_validated',
  'invoice_persisted',
  'ticket_completed',
  'manual_review_required',
  'failed_blocking'
];
