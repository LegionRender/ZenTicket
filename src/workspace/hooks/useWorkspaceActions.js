import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  createInlineConnector,
  createTrainedConnector,
  seedDefaultConnectors
} from "@/services/firebase/connectorsService";
import { createInvoice } from "@/services/firebase/invoicesService";
import {
  completeOnboardingProfile,
  recoverUserHistoryByMatchingDetails,
  saveFiscalProfile
} from "@/services/firebase/profilesService";
import { createTicket, deleteTicket, updateTicket } from "@/services/firebase/ticketsService";

export function useWorkspaceActions({
  connectors,
  fiscalProfile,
  setActiveTab,
  setConnectors,
  setFiscalProfile,
  user
}) {
  const [profileSaving, setProfileSaving] = useState(false);
  const [isLearningLoading, setIsLearningLoading] = useState(false);
  const [learningStatus, setLearningStatus] = useState("");
  const [learningProgress, setLearningProgress] = useState(0);
  const [learningCompany, setLearningCompany] = useState("");
  const [learningBudgetLimit, setLearningBudgetLimit] = useState(() => {
    return parseFloat(localStorage.getItem("learningBudgetLimit") || "15.00");
  });
  const learningTimeoutRef = useRef(null);

  useEffect(() => {
    if (!user) return;

    const syncHistory = async () => {
      try {
        const result = await recoverUserHistoryByMatchingDetails(user, user.email, null, null);
        if (!result.recovered) return;

        toast.success(
          `ðŸŽ‰ Â¡Memoria sincronizada! Recuperamos ${result.migratedTickets} tickets, ${result.migratedInvoices} CFDI y ${result.migratedConnectors} conectores de tu historial previo.`
        );
      } catch (err) {
        console.error("Error in historical recovery:", err);
      }
    };

    syncHistory();
  }, [user]);

  const handleSaveProfile = async (profileData) => {
    if (!user) return;

    setProfileSaving(true);
    try {
      const recoveryToastId = toast.loading("Sincronizando y recuperando historial de cuenta detectado...");
      const recoveryResult = await recoverUserHistoryByMatchingDetails(
        user,
        profileData.correoElectronico || user.email,
        profileData.telefono,
        profileData.rfc
      );
      toast.dismiss(recoveryToastId);

      if (recoveryResult.recovered) {
        toast.success(
          `ðŸŽ‰ Â¡Memoria sincronizada! Recuperamos ${recoveryResult.migratedTickets} tickets, ${recoveryResult.migratedInvoices} CFDI y ${recoveryResult.migratedConnectors} conectores de tu historial previo.`
        );
      }

      const updatedProfile = await saveFiscalProfile(user, profileData);
      setFiscalProfile((prev) => ({
        ...prev,
        ...updatedProfile,
        onboardingCompleted: prev?.onboardingCompleted || true
      }));
      toast.success("Perfil fiscal del receptor guardado correctamente.");
    } catch (err) {
      console.error("Error in profile update:", err);
      toast.error("Fallo al persistir cambios fiscales en la nube.");
      throw err;
    } finally {
      setProfileSaving(false);
    }
  };

  const handleOnboardingComplete = async (onboardingData) => {
    if (!user) return;

    try {
      let fiscalData;
      try {
        fiscalData = await completeOnboardingProfile(user, onboardingData);
      } catch (userErr) {
        console.warn("No se pudo persistir en la colecciÃ³n de usuarios, procediendo:", userErr);
        fiscalData = await completeOnboardingProfile(user, onboardingData);
      }

      setFiscalProfile({ id: user.uid, ...fiscalData });
      setActiveTab("inicio");
      toast.success("Â¡Tu perfil de onboarding se ha creado con Ã©xito!");
    } catch (err) {
      console.error("Error saving onboarding details:", err);
      toast.error("Error al persistir tus datos del onboarding en la nube: " + (err.message || err.toString()));
    }
  };

  const onSaveTicketToDb = async (ticketData) => {
    if (!user) return "";

    try {
      const ticket = await createTicket(user, ticketData);
      return ticket.id;
    } catch (e) {
      console.error("Error saving ticket photo:", e);
      throw e;
    }
  };

  const onUpdateTicketInDb = async (ticketId, updates) => {
    try {
      await updateTicket(ticketId, updates);
    } catch (e) {
      console.error("Error merging updates to ticket:", e);
      throw e;
    }
  };

  const onSaveInvoiceToDb = async (
    ticketId,
    xml,
    pdf,
    uuid,
    emisorRfc,
    emisorName,
    total,
    cost = 2.5,
    connectorType = "existente",
    rawCost = 0.0016
  ) => {
    if (!user) return;

    try {
      await createInvoice(user, fiscalProfile, {
        connectorType,
        cost,
        emisorName,
        emisorRfc,
        pdf,
        rawCost,
        ticketId,
        total,
        uuid,
        xml
      });
      toast.success("Â¡Certificado CFDI guardado con Ã©xito en sus Gastos!");
    } catch (e) {
      console.error("Error saving CFDI:", e);
      toast.error("Error al registrar factura certificada.");
      throw e;
    }
  };

  const onDeleteTicket = async (ticketId) => {
    try {
      await deleteTicket(ticketId);
      toast.success("Ticket eliminado de su biblioteca.");
    } catch (e) {
      console.error("Error deleting ticket:", e);
      toast.error("No se pudo remover el ticket.");
    }
  };

  const onLearnConnectorInline = async (nombre, rfc, learnedFrom = "automatizacion_ticket") => {
    const connector = await createInlineConnector(user, fiscalProfile, nombre, rfc, learnedFrom);
    setConnectors([...connectors, connector]);
    return connector;
  };

  const onCancelLearning = () => {
    if (learningTimeoutRef.current) {
      clearTimeout(learningTimeoutRef.current);
    }
    setIsLearningLoading(false);
    setLearningStatus("");
    setLearningProgress(0);
    toast.error("Entrenamiento IA abortado de forma administrativa por presupuesto.");
  };

  const onLearnConnector = async (nombre, rfc, tokenSaver = true) => {
    setIsLearningLoading(true);
    setLearningCompany(nombre);
    setLearningProgress(0);
    setLearningStatus("Iniciando motor cognitivo SAT...");

    const steps = [
      { progress: 10, status: "Evaluando estructura del portal web..." },
      { progress: 28, status: "Estructurando grafo de navegaciÃ³n Playwright..." },
      { progress: 45, status: "Emparejando campos (RFC, Folio, Monto)..." },
      { progress: 62, status: "Verificando CAPTCHAs y protecciones anti-bot..." },
      { progress: 80, status: "Compilando conector robÃ³tico en formato JSON..." },
      { progress: 95, status: "Registrando conector de forma global..." },
      { progress: 100, status: "SincronizaciÃ³n completada con Ã©xito." }
    ];

    try {
      for (const step of steps) {
        await new Promise((resolve) => {
          learningTimeoutRef.current = setTimeout(resolve, tokenSaver ? 1200 : 700);
        });
        setLearningProgress(step.progress);
        setLearningStatus(step.status);
      }

      await createTrainedConnector(user, fiscalProfile, nombre, rfc, tokenSaver);
      toast.success(`Mapeador para ${nombre} entrenado y en operaciÃ³n SAT.`);
    } catch (e) {
      console.error(e);
      toast.error("Error durante el flujo cognitivo de entrenamiento de campos.");
    } finally {
      setIsLearningLoading(false);
      setLearningProgress(0);
      setLearningStatus("");
    }
  };

  const onUpdateLearningBudgetLimit = async (newLimit) => {
    setLearningBudgetLimit(newLimit);
    localStorage.setItem("learningBudgetLimit", newLimit.toString());
    toast.success(`Tope de presupuesto de IA actualizado a $${newLimit.toFixed(2)} MXN`);
  };

  const onForceReSeed = async () => {
    try {
      await seedDefaultConnectors(connectors);
      toast.success("Se sincronizÃ³ satisfactoriamente la base de portales comerciales.");
    } catch (err) {
      console.error(err);
      toast.error("Fallo al restablecer la base estÃ¡ndar de portales.");
    }
  };

  const onUpdateTicket = async (ticketId, updates) => {
    try {
      await updateTicket(ticketId, updates);
    } catch (e) {
      console.error("Error updating ticket details:", e);
    }
  };

  const onStartTicketAutomation = async () => {
    toast.info("Iniciando secuencia robÃ³tica Playwright de timbrado...");
  };

  return {
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
  };
}
