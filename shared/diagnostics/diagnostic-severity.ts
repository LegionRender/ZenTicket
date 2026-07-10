import { DiagnosticStage } from "./diagnostic-stages";

export type DiagnosticSeverity = 'info' | 'warning' | 'error' | 'critical';

export const getStageSeverity = (stage: DiagnosticStage, status: string): DiagnosticSeverity => {
  if (status === 'failed') {
    if ([
      'failed_blocking',
      'manual_review_required',
      'xml_download_failed',
      'xml_validation_failed',
      'sat_validation_failed'
    ].includes(stage)) {
      return 'critical';
    }
    return 'error';
  }
  if (status === 'warning') {
    return 'warning';
  }
  return 'info';
};
