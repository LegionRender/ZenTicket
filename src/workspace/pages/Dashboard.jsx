import React, { useState, useEffect } from "react";
import { useAuth } from "@/auth/context/AuthContext";
import { toast } from "sonner";

import { OnboardingFlow } from "@/workspace/features/home/OnboardingFlow";
import { useWorkspaceActions } from "@/workspace/hooks/useWorkspaceActions";
import { useWorkspaceData } from "@/workspace/hooks/useWorkspaceData";
import WorkspaceLayout from "@/workspace/layout/WorkspaceLayout";
import WorkspaceRoutes from "@/workspace/router/WorkspaceRoutes";

export const Dashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("inicio"); // "inicio" | "capturar" | "tickets" | "conectores" | "historial" | "cuenta" | "admin"

  const {
    allInvoices,
    allProfiles,
    allTickets,
    connectors,
    fiscalProfile,
    invoices,
    setConnectors,
    setFiscalProfile,
    tickets
  } = useWorkspaceData(user);

  // 2. Auxiliary navigation states
  const [preselectedTicketId, setPreselectedTicketId] = useState(null);
  const [newlyAddedTicketId, setNewlyAddedTicketId] = useState(null);

  const {
    handleOnboardingComplete,
    handleSaveProfile,
    isLearningLoading,
    learningBudgetLimit,
    learningCompany,
    learningProgress,
    learningStatus,
    onCancelLearning,
    onDeleteTicket,
    onForceReSeed,
    onLearnConnector,
    onLearnConnectorInline,
    onSaveInvoiceToDb,
    onSaveTicketToDb,
    onStartTicketAutomation,
    onUpdateLearningBudgetLimit,
    onUpdateTicket,
    onUpdateTicketInDb,
    profileSaving
  } = useWorkspaceActions({
    connectors,
    fiscalProfile,
    setActiveTab,
    setConnectors,
    setFiscalProfile,
    user
  });

  const isAdmin = user?.email === "legionrender@gmail.com";
  const isProfileComplete = true; // No validation locks - the app is completely open for navigation and operation

  const isNavigationDisabled = (fiscalProfile?.navigationDisabled || false) && !isProfileComplete;

  const handleTabClick = (tab) => {
    if (isNavigationDisabled) {
      toast.error("La navegación del contribuyente está desactivada permanentemente por mandato fiscal de datos guardados.", {
        description: "Los datos de facturación se encuentran bloqueados y vigentes."
      });
      return;
    }
    if (!isProfileComplete && tab !== "cuenta") {
      toast.warning("Para poder usar ZenTicket, es obligatorio configurar primero tus datos fiscales.", {
        description: "Completa el formulario en tu panel de cuenta."
      });
      setActiveTab("cuenta");
    } else {
      setActiveTab(tab);
    }
  };

  // Forzar pestaña "cuenta" si el perfil fiscal está incompleto
  useEffect(() => {
    if (fiscalProfile !== null && !isProfileComplete) {
      if (activeTab !== "cuenta") {
        setActiveTab("cuenta");
      }
    }
  }, [fiscalProfile, isProfileComplete, activeTab]);

  const onTriggerSimulationInline = (ticket) => {
    setPreselectedTicketId(ticket.id || null);
    handleTabClick("capturar");
  };

  const onClearPreselectedTicket = () => {
    setPreselectedTicketId(null);
  };

  if (fiscalProfile === null) {
    return (
      <div className="min-h-screen bg-[#05070e] flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-[#0B53F4] border-t-transparent"></div>
        <p className="text-white/40 text-[11px] mt-4 font-mono uppercase tracking-widest">Sincronizando claves del emisor...</p>
      </div>
    );
  }

  if (user && !fiscalProfile.onboardingCompleted) {
    return (
      <OnboardingFlow 
        user={user} 
        fiscalProfile={fiscalProfile} 
        onComplete={handleOnboardingComplete} 
      />
    );
  }

  return (
    <WorkspaceLayout
      activeTab={activeTab}
      handleTabClick={handleTabClick}
      isAdmin={isAdmin}
      isNavigationDisabled={isNavigationDisabled}
      isProfileComplete={isProfileComplete}
      logout={logout}
      user={user}
    >
      <WorkspaceRoutes
        activeTab={activeTab}
        allInvoices={allInvoices}
        allProfiles={allProfiles}
        allTickets={allTickets}
        connectors={connectors}
        fiscalProfile={fiscalProfile}
        handleSaveProfile={handleSaveProfile}
        handleTabClick={handleTabClick}
        invoices={invoices}
        isAdmin={isAdmin}
        isLearningLoading={isLearningLoading}
        learningBudgetLimit={learningBudgetLimit}
        learningCompany={learningCompany}
        learningProgress={learningProgress}
        learningStatus={learningStatus}
        newlyAddedTicketId={newlyAddedTicketId}
        onCancelLearning={onCancelLearning}
        onClearPreselectedTicket={onClearPreselectedTicket}
        onDeleteTicket={onDeleteTicket}
        onForceReSeed={onForceReSeed}
        onLearnConnector={onLearnConnector}
        onLearnConnectorInline={onLearnConnectorInline}
        onSaveInvoiceToDb={onSaveInvoiceToDb}
        onSaveTicketToDb={onSaveTicketToDb}
        onStartTicketAutomation={onStartTicketAutomation}
        onTriggerSimulationInline={onTriggerSimulationInline}
        onUpdateLearningBudgetLimit={onUpdateLearningBudgetLimit}
        onUpdateTicket={onUpdateTicket}
        onUpdateTicketInDb={onUpdateTicketInDb}
        preselectedTicketId={preselectedTicketId}
        profileSaving={profileSaving}
        setNewlyAddedTicketId={setNewlyAddedTicketId}
        tickets={tickets}
        user={user}
      />
    </WorkspaceLayout>
  );
};

export default Dashboard;
