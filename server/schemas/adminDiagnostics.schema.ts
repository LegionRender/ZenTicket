import { z } from "zod";

export const listDiagnosticsSchema = z.object({
  query: z.object({
    userId: z.string().optional(),
    connectorId: z.string().optional(),
    portalName: z.string().optional(),
    ticketId: z.string().optional(),
    ticketReference: z.string().optional(),
    jobId: z.string().optional(),
    stage: z.string().optional(),
    errorCode: z.string().optional(),
    severity: z.enum(["info", "warning", "error", "critical"]).optional(),
    status: z.string().optional(),
    requiresManualReview: z.string().transform(val => val === "true").optional(),
    retryable: z.string().transform(val => val === "true").optional(),
    problemSignature: z.string().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    visibility: z.enum(["active", "archived", "all"]).optional().default("active"),
    view: z.enum(["by_user", "in_process", "attention", "failed", "ready", "archived", "all"]).optional().default("by_user"),
    limit: z.string()
      .optional()
      .transform(val => (val ? Math.min(parseInt(val, 10), 100) : 20)),
    cursor: z.string().optional()
  })
});

export const getDiagnosticDetailSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1, "El ticketId es obligatorio")
  })
});

export const markReviewedSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1, "El ticketId es obligatorio")
  }),
  body: z.object({
    note: z.string().max(500, "La nota no debe exceder 500 caracteres").optional()
  })
});

export const createConnectorTaskSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1, "El ticketId es obligatorio")
  })
});

export const proposeFixSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1, "El ticketId es obligatorio")
  })
});

export const proposalActionSchema = z.object({
  params: z.object({
    proposalId: z.string().min(1, "El proposalId es obligatorio")
  }),
  body: z.object({
    comment: z.string().max(500, "El comentario no debe exceder 500 caracteres").optional()
  }).optional()
});

export const listProposalsSchema = z.object({
  query: z.object({
    connectorId: z.string().optional(),
    status: z.string().optional()
  })
});

export const archiveDiagnosticSchema = z.object({
  params: z.object({
    ticketId: z.string().min(1, "El ticketId es obligatorio")
  }),
  body: z.object({
    reason: z.enum(["portal_change", "user_error", "captcha_required", "service_down", "manual_resolution", "other"]),
    comment: z.string().max(500, "El comentario no debe exceder 500 caracteres").optional()
  })
});

