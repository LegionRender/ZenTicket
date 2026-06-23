import React from "react";
import ScannerAndSimulator from "@/workspace/features/scanner/ScannerAndSimulator";

export const HomeScreen = ({
  fiscalProfile,
  connectors,
  onSaveTicketToDb,
  onUpdateTicketInDb,
  onSaveInvoiceToDb,
  onLearnConnectorInline,
  tickets,
  invoices,
  preselectedTicketId,
  onClearPreselectedTicket,
  onStartAutomation,
  onTabChange,
  onSetNewlyAddedTicketId,
  onSaveProfile
}) => {
  return (
    <div className="bg-white/90 backdrop-blur-sm border border-slate-200/50 rounded-3xl p-5 sm:p-8 md:p-10 shadow-[0_15px_35px_-10px_rgba(37,99,235,0.03)] transition-all">
      <ScannerAndSimulator
        fiscalProfile={fiscalProfile}
        connectors={connectors}
        onSaveTicketToDb={onSaveTicketToDb}
        onUpdateTicketInDb={onUpdateTicketInDb}
        onSaveInvoiceToDb={onSaveInvoiceToDb}
        onLearnConnectorInline={onLearnConnectorInline}
        tickets={tickets}
        invoices={invoices}
        preselectedTicketId={preselectedTicketId}
        onClearPreselectedTicket={onClearPreselectedTicket}
        onStartAutomation={onStartAutomation}
        onTabChange={onTabChange}
        onSetNewlyAddedTicketId={onSetNewlyAddedTicketId}
        onSaveProfile={onSaveProfile}
      />
    </div>
  );
};

export default HomeScreen;
