import type { Connector, FiscalProfile, Invoice, Ticket } from "@/types";

export type NotificationTab = "todas" | "pendientes" | "facturas" | "gastos" | "cuenta";
export type NotificationCategory = "pendientes" | "facturas" | "gastos" | "cuenta";
export type NotificationCriticality = "critica" | "importante" | "informativa";
export type NotificationActionType = "contingency" | "info";
export type ContingencyStrategy = "ocr" | "rfc" | "resico" | "playwright";

export interface OperationalNotification {
  id: string;
  category: NotificationCategory;
  criticality: NotificationCriticality;
  title: string;
  message: string;
  createdAt: Date;
  read: boolean;
  actionText: string;
  actionType: NotificationActionType;
}

export interface ScannerAndSimulatorProps {
  fiscalProfile: FiscalProfile | null;
  connectors: Connector[];
  onSaveTicketToDb: (ticket: Ticket) => Promise<string>;
  onUpdateTicketInDb: (ticketId: string, updates: Partial<Ticket>) => Promise<void>;
  onSaveInvoiceToDb: (
    ticketId: string,
    xml: string,
    pdf: string,
    uuid: string,
    emisorRfc: string,
    emisorName: string,
    total: number,
    cost?: number,
    connectorType?: "existente" | "nuevo",
    rawCost?: number
  ) => Promise<void>;
  onLearnConnectorInline: (
    nombre: string,
    rfc: string,
    learnedFrom?: "automatizacion_ticket" | "portal_admin"
  ) => Promise<Connector>;
  tickets: Ticket[];
  invoices?: Invoice[];
  preselectedTicketId: string | null;
  onClearPreselectedTicket: () => void;
  onStartAutomation?: (ticketId: string) => Promise<void>;
  onTabChange?: (tab: string) => void;
  onSetNewlyAddedTicketId?: (id: string | null) => void;
  onSaveProfile?: (profile: FiscalProfile) => Promise<void>;
}
