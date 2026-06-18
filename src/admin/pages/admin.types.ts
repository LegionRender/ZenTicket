import type { Connector, FiscalProfile, Invoice, Ticket } from "@/types";

export interface AdminScreenProps {
  connectors: Connector[];
  tickets: Ticket[];
  invoices: Invoice[];
  allProfiles?: FiscalProfile[];
  onForceReSeed: () => Promise<void>;
  onLearnConnector: (nombre: string, rfc: string, tokenSaver?: boolean) => Promise<void>;
  isLearningLoading: boolean;
  learningStatus: string;
  learningProgress: number;
  onCancelLearning: () => void;
  learningCompany: string;
  learningBudgetLimit: number;
  onUpdateLearningBudgetLimit: (newLimit: number) => Promise<void>;
  onUpdateTicket: (ticketId: string, updates: Partial<Ticket>) => Promise<void>;
  onStartTicketAutomation: (ticketId: string) => Promise<void>;
}
