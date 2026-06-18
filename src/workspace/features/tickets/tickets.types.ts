import type { Invoice, Ticket } from "@/types";

export interface TicketsListScreenProps {
  tickets: Ticket[];
  invoices: Invoice[];
  onTriggerSimulationInline: (ticket: Ticket) => void;
  currentUserEmail?: string | null;
  onDeleteTicket?: (ticketId: string) => void;
  onTabChange?: (tab: "inicio" | "capturar" | "tickets" | "conectores" | "historial" | "resumen" | "cuenta" | "admin") => void;
  newlyAddedTicketId?: string | null;
  onClearNewlyAddedTicketId?: () => void;
}
