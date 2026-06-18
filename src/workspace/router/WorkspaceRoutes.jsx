import HomeScreen from "@/workspace/features/home/HomeScreen";
import AdminScreen from "@/admin/pages/AdminScreen";
import ConnectorsList from "@/workspace/features/connectors/ConnectorsList";
import ProfileForm from "@/workspace/features/account/ProfileForm";
import ScannerAndSimulator from "@/workspace/features/scanner/ScannerAndSimulator";
import TicketsListScreen from "@/workspace/features/tickets/TicketsListScreen";
import VaultScreen from "@/workspace/features/expenses/VaultScreen";
import WorkspacePanel from "@/workspace/layout/WorkspacePanel";

export default function WorkspaceRoutes({
  activeTab,
  allInvoices,
  allProfiles,
  allTickets,
  connectors,
  fiscalProfile,
  handleSaveProfile,
  handleTabClick,
  invoices,
  isAdmin,
  isLearningLoading,
  learningBudgetLimit,
  learningCompany,
  learningProgress,
  learningStatus,
  newlyAddedTicketId,
  onCancelLearning,
  onClearPreselectedTicket,
  onDeleteTicket,
  onForceReSeed,
  onLearnConnector,
  onLearnConnectorInline,
  onSaveInvoiceToDb,
  onSaveTicketToDb,
  onStartTicketAutomation,
  onTriggerSimulationInline,
  onUpdateLearningBudgetLimit,
  onUpdateTicket,
  onUpdateTicketInDb,
  preselectedTicketId,
  profileSaving,
  setNewlyAddedTicketId,
  tickets,
  user
}) {
  return (
    <>
      {activeTab === "inicio" && (
        <WorkspacePanel className="px-0 py-0 sm:px-0 sm:py-0 md:px-0 md:py-0">
          <HomeScreen
            fiscalProfile={fiscalProfile}
            invoices={invoices}
            tickets={tickets}
            user={user}
            onTabChange={handleTabClick}
            onUpdateTicketInDb={onUpdateTicketInDb}
          />
        </WorkspacePanel>
      )}

      {activeTab === "capturar" && (
        <WorkspacePanel>
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
            onStartAutomation={onStartTicketAutomation}
            onTabChange={handleTabClick}
            onSetNewlyAddedTicketId={setNewlyAddedTicketId}
            onSaveProfile={handleSaveProfile}
          />
        </WorkspacePanel>
      )}

      {activeTab === "tickets" && (
        <WorkspacePanel>
          <TicketsListScreen
            tickets={tickets}
            invoices={invoices}
            onTriggerSimulationInline={onTriggerSimulationInline}
            currentUserEmail={user?.email}
            onDeleteTicket={onDeleteTicket}
            onTabChange={handleTabClick}
            newlyAddedTicketId={newlyAddedTicketId}
            onClearNewlyAddedTicketId={() => setNewlyAddedTicketId(null)}
          />
        </WorkspacePanel>
      )}

      {activeTab === "conectores" && (
        <WorkspacePanel>
          <ConnectorsList
            connectors={connectors}
            onLearnConnector={onLearnConnector}
            isLoading={isLearningLoading}
          />
        </WorkspacePanel>
      )}

      {activeTab === "historial" && (
        <WorkspacePanel>
          <VaultScreen invoices={invoices} onTabChange={handleTabClick} />
        </WorkspacePanel>
      )}

      {activeTab === "cuenta" && (
        <WorkspacePanel>
          <ProfileForm
            initialProfile={fiscalProfile}
            onSave={handleSaveProfile}
            isSaving={profileSaving}
            currentUserEmail={user?.email}
            invoices={invoices}
            onTabChange={handleTabClick}
          />
        </WorkspacePanel>
      )}

      {activeTab === "admin" && isAdmin && (
        <WorkspacePanel className="zt-admin">
          <AdminScreen
            connectors={connectors}
            tickets={allTickets}
            invoices={allInvoices}
            allProfiles={allProfiles}
            onForceReSeed={onForceReSeed}
            onLearnConnector={onLearnConnector}
            isLearningLoading={isLearningLoading}
            learningStatus={learningStatus}
            learningProgress={learningProgress}
            onCancelLearning={onCancelLearning}
            learningCompany={learningCompany}
            learningBudgetLimit={learningBudgetLimit}
            onUpdateLearningBudgetLimit={onUpdateLearningBudgetLimit}
            onUpdateTicket={onUpdateTicket}
            onStartTicketAutomation={onStartTicketAutomation}
          />
        </WorkspacePanel>
      )}
    </>
  );
}
