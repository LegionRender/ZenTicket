import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/auth/context/AuthContext";
import { db } from "@/services/firebase/firebase";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  deleteDoc
} from "firebase/firestore";
import { toast } from "sonner";
import {
  User,
  LogOut,
  Sparkles,
  Layers,
  Building,
  History,
  ShieldCheck,
  Building2,
  RefreshCw,
  HelpCircle,
  AlertCircle
} from "lucide-react";

import HomeScreen from "@/workspace/features/home/HomeScreen";
import TicketsListScreen from "@/workspace/features/tickets/TicketsListScreen";
import ConnectorsList from "@/workspace/features/connectors/ConnectorsList";
import VaultScreen from "@/workspace/features/expenses/VaultScreen";
import ProfileForm from "@/workspace/features/account/ProfileForm";
import AdminScreen from "@/admin/pages/AdminScreen";
import Logo from "@/shared/brand/Logo";
import { ZenLogo } from "@/shared/brand/ZenLogo";
import { OnboardingFlow } from "@/auth/components/OnboardingFlow";

export const Dashboard = () => {
  const { user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState("capturar"); // "capturar" | "tickets" | "conectores" | "historial" | "cuenta" | "admin"
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);

  // 1. Core database states
  const [fiscalProfile, setFiscalProfile] = useState(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [connectors, setConnectors] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [allTickets, setAllTickets] = useState([]);
  const [allInvoices, setAllInvoices] = useState([]);

  // 2. Auxiliary navigation states
  const [preselectedTicketId, setPreselectedTicketId] = useState(null);
  const [newlyAddedTicketId, setNewlyAddedTicketId] = useState(null);

  // 3. AI Portal Training Simulator administrative parameters
  const [isLearningLoading, setIsLearningLoading] = useState(false);
  const [learningStatus, setLearningStatus] = useState("");
  const [learningProgress, setLearningProgress] = useState(0);
  const [learningCompany, setLearningCompany] = useState("");
  const [learningBudgetLimit, setLearningBudgetLimit] = useState(() => {
    return parseFloat(localStorage.getItem("learningBudgetLimit") || "15.00");
  });
  const learningTimeoutRef = useRef(null);

  // Real-time synchronization of Fiscal Profile for current active user
  useEffect(() => {
    if (!user) {
      setFiscalProfile(null);
      return;
    }

    let isActive = true;
    let unsubscribe = () => {};

    const isAdminEmail = user.email === "legionrender@gmail.com";
    const initialDef = {
      userId: user.uid,
      rfc: isAdminEmail ? "GOMD850101XYZ" : "CABE850101ABC",
      razonSocial: isAdminEmail ? "CONSTRUCTORA LEGION DEL NORTE SA DE CV" : "RICARDO CASTRO BECERRIL",
      regimenFiscal: "626",
      codigoPostal: "02000",
      usoCFDI: "G03",
      plan: "gratuito",
      onboardingCompleted: true,
      paymentCards: [
        {
          id: "card_real_ricardo",
          brand: "VISA",
          last4: isAdminEmail ? "9180" : "4242",
          expiry: "12/28",
          isDefault: true,
          holderName: isAdminEmail ? "RICARDO CASTRO BECERRIL" : "RICARDO CASTRO",
          bankName: isAdminEmail ? "BBVA Bancomer" : "VISA"
        }
      ]
    };

    const getFallbackProfile = () => {
      const saved = localStorage.getItem("fiscalProfile_" + user.uid);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (_) {}
      }
      return initialDef;
    };

    // Firestore timeout fallback to prevent getting stuck
    const fallbackTimer = window.setTimeout(() => {
      if (!isActive) return;
      console.warn("Fiscal profile synchronization timed out; using local fallback.");
      setFiscalProfile((current) => current ?? getFallbackProfile());
    }, 4000);

    try {
      const docRef = doc(db, "fiscalProfiles", user.uid);
      unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (!isActive) return;
        window.clearTimeout(fallbackTimer);

        const isNewSignup = localStorage.getItem("is_new_signup_" + user.uid) === "true";

        if (docSnap.exists()) {
          const data = docSnap.data();
          if (!data.plan) {
            data.plan = "gratuito";
          }
          
          if (!isNewSignup && data.onboardingCompleted !== true) {
            data.onboardingCompleted = true;
            setDoc(docRef, { onboardingCompleted: true }, { merge: true }).catch((err) => {
              console.warn("Error background updating onboardingCompleted status:", err);
            });
          }

          const profileObj = { id: docSnap.id, ...data };
          setFiscalProfile(profileObj);
          localStorage.setItem("fiscalProfile_" + user.uid, JSON.stringify(profileObj));
        } else {
          // Build fallback initial profile
          const customInitial = {
            ...initialDef,
            onboardingCompleted: !isNewSignup
          };
          setFiscalProfile(customInitial);
          localStorage.setItem("fiscalProfile_" + user.uid, JSON.stringify(customInitial));

          if (!isNewSignup) {
            setDoc(docRef, customInitial, { merge: true }).catch((err) => {
              console.warn("Error background saving initial fiscal profile:", err);
            });
          }
        }
      }, (err) => {
        if (!isActive) return;
        window.clearTimeout(fallbackTimer);
        console.error("Error watching user fiscal profile:", err);
        if (err?.message?.includes("Quota") || err?.message?.includes("quota") || err?.code?.includes("resource-exhausted")) {
          setIsQuotaExceeded(true);
        }
        setFiscalProfile((current) => current ?? getFallbackProfile());
      });
    } catch (err) {
      window.clearTimeout(fallbackTimer);
      console.error("Error starting fiscal profile listener:", err);
      setFiscalProfile((current) => current ?? getFallbackProfile());
    }

    return () => {
      isActive = false;
      window.clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, [user]);

  // Real-time user's digital Vault invoices
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "invoices"),
      where("userId", "==", user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        list.push({ ...d.data(), id: d.id });
      });
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setInvoices(list);
      localStorage.setItem("local_invoices_" + user.uid, JSON.stringify(list));
    }, (err) => {
      console.error("Error watching invoices:", err);
      if (err?.message?.includes("Quota") || err?.message?.includes("quota") || err?.code?.includes("resource-exhausted")) {
        setIsQuotaExceeded(true);
      }
      // Fallback
      const saved = localStorage.getItem("local_invoices_" + user.uid);
      if (saved) {
        try {
          setInvoices(JSON.parse(saved));
        } catch (_) {}
      }
    });
    return unsubscribe;
  }, [user]);

  // Real-time user's processed tickets
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "tickets"),
      where("userId", "==", user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        list.push({ ...d.data(), id: d.id });
      });
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setTickets(list);
      localStorage.setItem("local_tickets_" + user.uid, JSON.stringify(list));
    }, (err) => {
      console.error("Error watching tickets:", err);
      if (err?.message?.includes("Quota") || err?.message?.includes("quota") || err?.code?.includes("resource-exhausted")) {
        setIsQuotaExceeded(true);
      }
      // Fallback
      const saved = localStorage.getItem("local_tickets_" + user.uid);
      if (saved) {
        try {
          setTickets(JSON.parse(saved));
        } catch (_) {}
      }
    });
    return unsubscribe;
  }, [user]);

  // Real-time connectors query (all users have read-level access to system-wide or trained portals)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "connectors"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        list.push({ ...d.data(), id: d.id });
      });
      setConnectors(list);
      localStorage.setItem("local_connectors", JSON.stringify(list));
    }, (err) => {
      console.error("Error watching connectors:", err);
      if (err?.message?.includes("Quota") || err?.message?.includes("quota") || err?.code?.includes("resource-exhausted")) {
        setIsQuotaExceeded(true);
      }
      // Fallback
      const saved = localStorage.getItem("local_connectors");
      if (saved) {
        try {
          setConnectors(JSON.parse(saved));
        } catch (_) {}
      } else {
        // Fallback to static system connectors
        setConnectors([
          {
            id: "system-starbucks",
            userId: "system",
            nombre: "Starbucks / Alsea",
            rfc: "SHE190630TX1",
            portalUrl: "https://alsea.facturacion.com",
            fieldsJson: JSON.stringify([
              { key: "rfc", name: "RFC Receptor", selector: "input#rfc_id", type: "text", required: true },
              { key: "folio", name: "Ticket Folio", selector: "input#folio_ticket", type: "text", required: true },
              { key: "total", name: "Total Importe", selector: "input#total_amount", type: "number", required: true },
              { key: "fecha", name: "Fecha Compra", selector: "input#fecha_day", type: "date", required: true }
            ]),
            flowJson: JSON.stringify([
              "1. Acceder al portal de facturación Alsea",
              "2. Capturar RFC receptor y datos del ticket de compra",
              "3. Indicar Uso de CFDI correspondiente",
              "4. Efectuar timbrado digital federal SAT",
              "5. Guardar documentos PDF y XML generados"
            ]),
            createdAt: new Date().toISOString()
          },
          {
            id: "system-oxxo",
            userId: "system",
            nombre: "OXXO Cadena",
            rfc: "CCO8605231N4",
            portalUrl: "http://factura.oxxo.com:8080",
            fieldsJson: JSON.stringify([
              { key: "rfc", name: "RFC Emisor", selector: "input[name='rfc']", type: "text", required: true },
              { key: "folio", name: "Número de Folio", selector: "input#folio", type: "text", required: true },
              { key: "total", name: "Total Ticket", selector: "input#importe", type: "number", required: true },
              { key: "fecha", name: "Fecha de Compra", selector: "input#fecha", type: "date", required: true }
            ]),
            flowJson: JSON.stringify([
              "1. Cargar el portal oficial de facturas de Tiendas OXXO",
              "2. Capturar los datos de ticket correspondientes",
              "3. Ingresar RFC de receptor fiscal",
              "4. Autorizar emisión de CFDI con sello SAT",
              "5. Consolidar documentos digitales en almacén"
            ]),
            createdAt: new Date().toISOString()
          },
          {
            id: "system-walmart",
            userId: "system",
            nombre: "Walmart / Aurrera",
            rfc: "NWM9709244W4",
            portalUrl: "https://facturacion.walmartmexico.com",
            fieldsJson: JSON.stringify([
              { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
              { key: "folio", name: "Número de Transacción", selector: "input#ticket", type: "text", required: true },
              { key: "total", name: "Monto Neto Total", selector: "input#monto", type: "number", required: true },
              { key: "fecha", name: "Fecha del Ticket", selector: "input#fecha", type: "date", required: true }
            ]),
            flowJson: JSON.stringify([
              "1. Ingresar al portal de facturas Walmart México",
              "2. Suministrar TR y RFC receptor",
              "3. Suministrar código de sucursal de compra",
              "4. Proceder con el timbrado fiscal",
              "5. Almacenar facturas PDF y XML"
            ]),
            createdAt: new Date().toISOString()
          }
        ]);
      }
    });
    return unsubscribe;
  }, [user]);

  // Real-time administrative watchers to feed standard cost auditing boards
  useEffect(() => {
    if (!user) return;
    
    // Only run administrative queries if the user email matches the bootstrapped admin
    if (user.email !== "legionrender@gmail.com") return;

    const qProfiles = query(collection(db, "fiscalProfiles"));
    const unsubscribeProfiles = onSnapshot(qProfiles, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ ...d.data(), id: d.id }));
      setAllProfiles(list);
    }, (err) => {
      console.error("Firestore Admin Profiles onSnapshot Error:", err);
    });

    const qTickets = query(collection(db, "tickets"));
    const unsubscribeTickets = onSnapshot(qTickets, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ ...d.data(), id: d.id }));
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setAllTickets(list);
    }, (err) => {
      console.error("Firestore Admin Tickets onSnapshot Error:", err);
    });

    const qInvoices = query(collection(db, "invoices"));
    const unsubscribeInvoices = onSnapshot(qInvoices, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ ...d.data(), id: d.id }));
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setAllInvoices(list);
    }, (err) => {
      console.error("Firestore Admin Invoices onSnapshot Error:", err);
    });

    return () => {
      unsubscribeProfiles();
      unsubscribeTickets();
      unsubscribeInvoices();
    };
  }, [user]);

  const recoverUserHistoryByMatchingDetails = async (targetEmail, targetPhone, targetRfc) => {
    if (!user) return;

    const emailToMatch = (targetEmail || "").trim().toLowerCase();
    const phoneToMatch = (targetPhone || "").trim();
    const rfcToMatch = (targetRfc || "").trim().toUpperCase();

    const isMockRfc = rfcToMatch === "" || rfcToMatch === "CABE850101ABC" || rfcToMatch === "GOMD850101XYZ";
    const isMockPhone = phoneToMatch === "" || phoneToMatch === "+52 55 1234 5678" || phoneToMatch === "5512345678";

    if (!emailToMatch && isMockPhone && isMockRfc) {
      return;
    }

    const matchedOldUserIds = new Set();

    try {
      // Query fiscal profiles to find any records with matching email, phone, or RFC belonging to another user
      const qProfiles = query(collection(db, "fiscalProfiles"));
      const snapProfiles = await getDocs(qProfiles);

      snapProfiles.forEach(docSnap => {
        const data = docSnap.data();
        const oldUid = docSnap.id;
        if (oldUid !== user.uid) {
          const profileEmail = (data.correoElectronico || "").trim().toLowerCase();
          const profileRecepcion = (data.correoRecepcion || "").trim().toLowerCase();
          const profilePhone = (data.telefono || "").trim();
          const profileRfc = (data.rfc || "").trim().toUpperCase();

          const emailMatched = emailToMatch && (profileEmail === emailToMatch || profileRecepcion === emailToMatch);
          const phoneMatched = !isMockPhone && phoneToMatch && (profilePhone === phoneToMatch);
          const rfcMatched = !isMockRfc && rfcToMatch && (profileRfc === rfcToMatch);

          if (emailMatched || phoneMatched || rfcMatched) {
            matchedOldUserIds.add(oldUid);
          }
        }
      });

      if (matchedOldUserIds.size === 0) {
        return;
      }

      const recoveryToastId = toast.loading("Sincronizando y recuperando historial de cuenta detectado...");

      let totalTicketsMigrated = 0;
      let totalInvoicesMigrated = 0;
      let totalConnectorsMigrated = 0;
      let recoveredProfileData = null;

      for (const oldUid of matchedOldUserIds) {
        const oldProfileDoc = snapProfiles.docs.find(d => d.id === oldUid);
        if (oldProfileDoc) {
          recoveredProfileData = oldProfileDoc.data();
        }

        // Migrate tickets
        const qTickets = query(collection(db, "tickets"), where("userId", "==", oldUid));
        const snapTickets = await getDocs(qTickets);
        for (const tDoc of snapTickets.docs) {
          await setDoc(doc(db, "tickets", tDoc.id), { userId: user.uid }, { merge: true });
          totalTicketsMigrated++;
        }

        // Migrate invoices
        const qInvoices = query(collection(db, "invoices"), where("userId", "==", oldUid));
        const snapInvoices = await getDocs(qInvoices);
        for (const iDoc of snapInvoices.docs) {
          await setDoc(doc(db, "invoices", iDoc.id), { userId: user.uid }, { merge: true });
          totalInvoicesMigrated++;
        }

        // Migrate connectors
        const qConnectors = query(collection(db, "connectors"), where("userId", "==", oldUid));
        const snapConnectors = await getDocs(qConnectors);
        for (const cDoc of snapConnectors.docs) {
          await setDoc(doc(db, "connectors", cDoc.id), { userId: user.uid }, { merge: true });
          totalConnectorsMigrated++;
        }

        // Migrate automation trainings
        const qTrainings = query(collection(db, "automation_trainings"), where("userId", "==", oldUid));
        const snapTrainings = await getDocs(qTrainings);
        for (const trDoc of snapTrainings.docs) {
          await setDoc(doc(db, "automation_trainings", trDoc.id), { userId: user.uid }, { merge: true });
        }
      }

      if (recoveredProfileData) {
        const currentProfileRef = doc(db, "fiscalProfiles", user.uid);
        await setDoc(currentProfileRef, {
          ...recoveredProfileData,
          userId: user.uid,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      toast.dismiss(recoveryToastId);
      toast.success(`🎉 ¡Memoria sincronizada! Recuperamos ${totalTicketsMigrated} tickets, ${totalInvoicesMigrated} CFDI y ${totalConnectorsMigrated} conectores de tu historial previo.`);
    } catch (err) {
      console.error("Error in historical recovery:", err);
    }
  };

  useEffect(() => {
    if (user) {
      recoverUserHistoryByMatchingDetails(user.email, null, null);
    }
  }, [user]);

  // --- PERSISTENCE AND OPERATIONAL EVENT HANDLERS ---

  const handleSaveProfile = async (profileData) => {
    if (!user) return;
    setProfileSaving(true);
    try {
      await recoverUserHistoryByMatchingDetails(
        profileData.correoElectronico || user.email,
        profileData.telefono,
        profileData.rfc
      );

      const docRef = doc(db, "fiscalProfiles", user.uid);
      const updatedProfile = {
        ...profileData,
        userId: user.uid,
        onboardingCompleted: true, // Prevent kicking user out to OnboardingFlow upon save
        updatedAt: new Date().toISOString()
      };
      
      try {
        await setDoc(docRef, updatedProfile, { merge: true });
      } catch (dbErr) {
        console.warn("Database save failed due to quota, saving locally:", dbErr);
        if (dbErr?.message?.includes("Quota") || dbErr?.message?.includes("quota") || dbErr?.code?.includes("resource-exhausted")) {
          setIsQuotaExceeded(true);
        }
      }

      setFiscalProfile(prev => {
        const next = {
          ...prev,
          ...updatedProfile,
          onboardingCompleted: prev?.onboardingCompleted || true
        };
        localStorage.setItem("fiscalProfile_" + user.uid, JSON.stringify(next));
        return next;
      });
      toast.success("Perfil fiscal del receptor guardado correctamente.");
    } catch (err) {
      console.error("Error in profile update:", err);
      toast.error("Fallo al persistir cambios fiscales.");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleOnboardingComplete = async (onboardingData) => {
    if (!user) return;
    try {
      // 1. Save to users collection (isolated to prevent blocker on edge cases)
      try {
        const userRef = doc(db, "users", user.uid);
        await setDoc(userRef, {
          name: onboardingData.name,
          telefono: onboardingData.telefono,
          photoURL: onboardingData.photoURL,
          onboardingCompleted: true,
          updatedAt: onboardingData.updatedAt || new Date().toISOString()
        }, { merge: true });
      } catch (userErr) {
        console.warn("No se pudo persistir en la colección de usuarios, procediendo:", userErr);
      }

      // 2. Save core fiscal profile (main driver for dashboard state)
      const fiscalRef = doc(db, "fiscalProfiles", user.uid);
      const fsData = {
        userId: user.uid,
        name: onboardingData.name,
        telefono: onboardingData.telefono,
        photoURL: onboardingData.photoURL,
        plan: onboardingData.plan || "gratuito",
        rfc: onboardingData.rfc,
        razonSocial: onboardingData.razonSocial,
        regimenFiscal: onboardingData.regimenFiscal,
        codigoPostal: onboardingData.codigoPostal,
        usoCFDI: onboardingData.usoCFDI,
        correoRecepcion: onboardingData.correoRecepcion,
        onboardingCompleted: true,
        updatedAt: onboardingData.updatedAt || new Date().toISOString()
      };

      try {
        await setDoc(fiscalRef, fsData, { merge: true });
      } catch (dbErr) {
        console.warn("Onboarding database save failed due to quota, saving locally:", dbErr);
        if (dbErr?.message?.includes("Quota") || dbErr?.message?.includes("quota") || dbErr?.code?.includes("resource-exhausted")) {
          setIsQuotaExceeded(true);
        }
      }
      
      localStorage.setItem("fiscalProfile_" + user.uid, JSON.stringify(fsData));
      setFiscalProfile({ id: user.uid, ...fsData });
      setActiveTab("capturar");
      
      toast.success("¡Tu perfil de onboarding se ha creado con éxito!");
    } catch (err) {
      console.error("Error saving onboarding details:", err);
      toast.error("Error al persistir tus datos del onboarding.");
    }
  };

  const onSaveTicketToDb = async (ticketData) => {
    if (!user) return "";
    try {
      const gId = "ticket_" + Math.random().toString(36).substring(2, 11);
      const tkt = {
        id: gId,
        ...ticketData,
        userId: user.uid,
        createdAt: ticketData.createdAt || new Date().toISOString()
      };

      try {
        const docRef = doc(db, "tickets", gId);
        await setDoc(docRef, tkt);
      } catch (dbErr) {
        console.warn("Ticket DB save failed due to quota, saving locally:", dbErr);
        if (dbErr?.message?.includes("Quota") || dbErr?.message?.includes("quota") || dbErr?.code?.includes("resource-exhausted")) {
          setIsQuotaExceeded(true);
        }
      }

      setTickets(prev => {
        const next = [tkt, ...prev];
        localStorage.setItem("local_tickets_" + user.uid, JSON.stringify(next));
        return next;
      });

      return tkt.id;
    } catch (e) {
      console.error("Error saving ticket photo:", e);
      throw e;
    }
  };

  const onUpdateTicketInDb = async (ticketId, updates) => {
    try {
      try {
        const docRef = doc(db, "tickets", ticketId);
        await setDoc(docRef, updates, { merge: true });
      } catch (dbErr) {
        console.warn("Ticket DB update failed due to quota, updating locally:", dbErr);
        if (dbErr?.message?.includes("Quota") || dbErr?.message?.includes("quota") || dbErr?.code?.includes("resource-exhausted")) {
          setIsQuotaExceeded(true);
        }
      }

      setTickets(prev => {
        const next = prev.map(t => t.id === ticketId ? { ...t, ...updates } : t);
        localStorage.setItem("local_tickets_" + user.uid, JSON.stringify(next));
        return next;
      });
    } catch (e) {
      console.error("Error merging updates to ticket:", e);
      throw e;
    }
  };

  const onSaveInvoiceToDb = async (
    ticketId, xml, pdf, uuid, emisorRfc, emisorName, total, cost = 2.50, connectorType = "existente", rawCost = 0.0016
  ) => {
    if (!user) return;
    try {
      const gId = "invoice_" + Math.random().toString(36).substring(2, 11);
      const invoicePayload = {
        id: gId,
        userId: user.uid,
        ticketId,
        folioFiscal: uuid,
        rfcEmisor: emisorRfc.toUpperCase(),
        nombreEmisor: emisorName.toUpperCase(),
        rfcReceptor: fiscalProfile?.rfc || "CABE850101ABC",
        nombreReceptor: fiscalProfile?.razonSocial || "RICARDO CASTRO BECERRIL",
        total: parseFloat(total.toString()),
        xmlContent: xml,
        pdfHtml: pdf,
        createdAt: new Date().toISOString(),
        cost,
        rawCost,
        connectorType
      };

      try {
        const docRef = doc(db, "invoices", gId);
        await setDoc(docRef, invoicePayload);
      } catch (dbErr) {
        console.warn("Invoice DB save failed due to quota, saving locally:", dbErr);
        if (dbErr?.message?.includes("Quota") || dbErr?.message?.includes("quota") || dbErr?.code?.includes("resource-exhausted")) {
          setIsQuotaExceeded(true);
        }
      }

      setInvoices(prev => {
        const next = [invoicePayload, ...prev];
        localStorage.setItem("local_invoices_" + user.uid, JSON.stringify(next));
        return next;
      });

      toast.success("¡Certificado CFDI guardado con éxito en sus Gastos!");
    } catch (e) {
      console.error("Error saving CFDI:", e);
      toast.error("Error al registrar factura certificada.");
      throw e;
    }
  };

  const onDeleteTicket = async (ticketId) => {
    try {
      try {
        const docRef = doc(db, "tickets", ticketId);
        await deleteDoc(docRef);
      } catch (dbErr) {
        console.warn("Delete DB call failed due to quota, deleting locally:", dbErr);
        if (dbErr?.message?.includes("Quota") || dbErr?.message?.includes("quota") || dbErr?.code?.includes("resource-exhausted")) {
          setIsQuotaExceeded(true);
        }
      }

      setTickets(prev => {
        const next = prev.filter(t => t.id !== ticketId);
        localStorage.setItem("local_tickets_" + user.uid, JSON.stringify(next));
        return next;
      });
      toast.success("Ticket eliminado de su biblioteca.");
    } catch (e) {
      console.error("Error deleting ticket:", e);
      toast.error("No se pudo remover el ticket.");
    }
  };

  const onClearPreselectedTicket = () => {
    setPreselectedTicketId(null);
  };

  // Learn a new portal on-the-fly inside the Scanner multi-step loader
  const onLearnConnectorInline = async (nombre, rfc, learnedFrom = "automatizacion_ticket") => {
    // Return a Promise that resolves to the newly created Connector object
    const fields = [
      { key: "rfc", name: "RFC Receptor", selector: "input#receptor_rfc", type: "text", required: true },
      { key: "folio", name: "Código de Facturación", selector: "input#ticket_id_folio", type: "text", required: true },
      { key: "total", name: "Total Facturado", selector: "input#total_amount_charge", type: "number", required: true },
      { key: "fecha", name: "Fecha del Ticket", selector: "input#fecha_day", type: "date", required: true }
    ];
    const flow = [
      "1. Acceder al portal remoto de facturación corporativa",
      "2. Ingresar código de referencia y RFC de receptor",
      "3. Configurar Uso de CFDI 4.0 seleccionado",
      "4. Solicitar timbrado certificado ante PAC",
      "5. Sincronizar comprobantes PDF y XML oficiales"
    ];

    const newConnector = {
      userId: user.uid,
      nombre: nombre.toUpperCase(),
      rfc: rfc.toUpperCase(),
      portalUrl: `https://${nombre.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "")}.com.mx/facturacion`,
      fieldsJson: JSON.stringify(fields),
      flowJson: JSON.stringify(flow),
      createdAt: new Date().toISOString(),
      cost: 15.00,
      rawCost: 0.12,
      learnedFrom,
      userName: fiscalProfile?.razonSocial || user?.displayName || "Usuario Integrado",
      userEmail: user?.email || "usuario@mail.com"
    };

    const docRef = doc(collection(db, "connectors"));
    await setDoc(docRef, newConnector);

    // Refresh selectors
    const updated = [...connectors, { id: docRef.id, ...newConnector }];
    setConnectors(updated);

    return { id: docRef.id, ...newConnector };
  };

  // Administrative training cancellation
  const onCancelLearning = () => {
    if (learningTimeoutRef.current) {
      clearTimeout(learningTimeoutRef.current);
    }
    setIsLearningLoading(false);
    setLearningStatus("");
    setLearningProgress(0);
    toast.error("Entrenamiento IA abortado de forma administrativa por presupuesto.");
  };

  // Administrative dynamic portal trainer
  const onLearnConnector = async (nombre, rfc, tokenSaver = true) => {
    setIsLearningLoading(true);
    setLearningCompany(nombre);
    setLearningProgress(0);
    setLearningStatus("Iniciando motor cognitivo SAT...");

    const steps = [
      { progress: 10, status: "Evaluando estructura del portal web..." },
      { progress: 28, status: "Estructurando grafo de navegación Playwright..." },
      { progress: 45, status: "Emparejando campos (RFC, Folio, Monto)..." },
      { progress: 62, status: "Verificando CAPTCHAs y protecciones anti-bot..." },
      { progress: 80, status: "Compilando conector robótico en formato JSON..." },
      { progress: 95, status: "Registrando conector de forma global..." },
      { progress: 100, status: "Sincronización completada con éxito." }
    ];

    try {
      for (const step of steps) {
        await new Promise((resolve) => {
          learningTimeoutRef.current = setTimeout(resolve, tokenSaver ? 1200 : 700);
        });
        setLearningProgress(step.progress);
        setLearningStatus(step.status);
      }

      const fields = [
        { key: "rfc", name: "RFC Emisor", selector: "input[name='rfc_receptor']", type: "text", required: true },
        { key: "folio", name: "Folio de Factura", selector: "input#folio_ticket", type: "text", required: true },
        { key: "total", name: "Total Neto", selector: "input.amount_sub", type: "number", required: true },
        { key: "fecha", name: "Fecha del Ticket", selector: "input#fecha_day", type: "date", required: true }
      ];
      const flow = [
        "1. Navegar al dominio de autofactura",
        "2. Identificar el ticket de consumo",
        "3. Llenar los datos de receptor fiscal",
        "4. Generar CFDI timbrado",
        "5. Descargar XML y representaciones visuales"
      ];

      const newConnector = {
        userId: user.uid,
        nombre: nombre.toUpperCase(),
        rfc: rfc.toUpperCase(),
        portalUrl: `https://${nombre.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "")}.com.mx/facturacion`,
        fieldsJson: JSON.stringify(fields),
        flowJson: JSON.stringify(flow),
        createdAt: new Date().toISOString(),
        cost: tokenSaver ? 12.50 : 25.00,
        rawCost: tokenSaver ? 0.08 : 0.22,
        learnedFrom: "portal_admin",
        userName: fiscalProfile?.razonSocial || user?.displayName || "Usuario Integrado",
        userEmail: user?.email || "usuario@mail.com"
      };

      const docRef = doc(collection(db, "connectors"));
      await setDoc(docRef, newConnector);
      toast.success(`Mapeador para ${nombre} entrenado y en operación SAT.`);
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
      const standardList = [
        {
          userId: "system",
          nombre: "Starbucks / Alsea",
          rfc: "SHE190630TX1",
          portalUrl: "https://alsea.facturacion.com",
          fieldsJson: JSON.stringify([
            { key: "rfc", name: "RFC Receptor", selector: "input#rfc_id", type: "text", required: true },
            { key: "folio", name: "Ticket Folio", selector: "input#folio_ticket", type: "text", required: true },
            { key: "total", name: "Total Importe", selector: "input#total_amount", type: "number", required: true },
            { key: "fecha", name: "Fecha Compra", selector: "input#fecha_day", type: "date", required: true }
          ]),
          flowJson: JSON.stringify([
            "1. Acceder al portal de facturación Alsea",
            "2. Capturar RFC receptor y datos del ticket de compra",
            "3. Indicar Uso de CFDI correspondiente",
            "4. Efectuar timbrado digital federal SAT",
            "5. Guardar documentos PDF y XML generados"
          ]),
          createdAt: new Date().toISOString()
        },
        {
          userId: "system",
          nombre: "OXXO Cadena",
          rfc: "CCO8605231N4",
          portalUrl: "http://factura.oxxo.com:8080",
          fieldsJson: JSON.stringify([
            { key: "rfc", name: "RFC Emisor", selector: "input[name='rfc']", type: "text", required: true },
            { key: "folio", name: "Número de Folio", selector: "input#folio", type: "text", required: true },
            { key: "total", name: "Total Ticket", selector: "input#importe", type: "number", required: true },
            { key: "fecha", name: "Fecha de Compra", selector: "input#fecha", type: "date", required: true }
          ]),
          flowJson: JSON.stringify([
            "1. Cargar el portal oficial de facturas de Tiendas OXXO",
            "2. Capturar los datos de ticket correspondientes",
            "3. Ingresar RFC de receptor fiscal",
            "4. Autorizar emisión de CFDI con sello SAT",
            "5. Consolidar documentos digitales en almacén"
          ]),
          createdAt: new Date().toISOString()
        },
        {
          userId: "system",
          nombre: "Walmart / Aurrera",
          rfc: "NWM9709244W4",
          portalUrl: "https://facturacion.walmartmexico.com",
          fieldsJson: JSON.stringify([
            { key: "rfc", name: "RFC Cliente", selector: "input#rfc", type: "text", required: true },
            { key: "folio", name: "Número de Transacción", selector: "input#ticket", type: "text", required: true },
            { key: "total", name: "Monto Neto Total", selector: "input#monto", type: "number", required: true },
            { key: "fecha", name: "Fecha del Ticket", selector: "input#fecha", type: "date", required: true }
          ]),
          flowJson: JSON.stringify([
            "1. Ingresar al portal de facturas Walmart México",
            "2. Suministrar TR y RFC receptor",
            "3. Suministrar código de sucursal de compra",
            "4. Proceder con el timbrado fiscal",
            "5. Almacenar facturas PDF y XML"
          ]),
          createdAt: new Date().toISOString()
        }
      ];

      for (const item of standardList) {
        const found = connectors.find((x) => x.rfc === item.rfc);
        if (!found) {
          const docRef = doc(collection(db, "connectors"));
          await setDoc(docRef, item);
        }
      }
      toast.success("Se sincronizó satisfactoriamente la base de portales comerciales.");
    } catch (err) {
      console.error(err);
      toast.error("Fallo al restablecer la base estándar de portales.");
    }
  };

  const onUpdateTicket = async (ticketId, updates) => {
    try {
      const docRef = doc(db, "tickets", ticketId);
      await setDoc(docRef, updates, { merge: true });
    } catch (e) {
      console.error("Error updating ticket details:", e);
    }
  };

  const onStartTicketAutomation = async (ticketId) => {
    toast.info("Iniciando secuencia robótica Playwright de timbrado...");
  };

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
    <div className="min-h-screen zt-soft-bg text-[#0b1020] font-body selection:bg-blue-600/10 selection:text-blue-600 flex flex-col md:flex-row pb-20 md:pb-0">
      
      {/* 1. DESKTOP SIDEBAR MENU (Left screen alignment) */}
      <aside className="hidden md:flex flex-col w-66 bg-white/80 backdrop-blur-md border-r border-slate-200/40 fixed inset-y-0 left-0 z-40 p-6 shadow-sm">
        <div className="flex flex-col h-full justify-between">
          <div>
            {/* Top Brand Logo */}
            <div className="cursor-pointer mb-8 py-2 border-b border-slate-200/30 pb-5" onClick={() => handleTabClick("capturar")}>
              <ZenLogo size={38} className="h-9 w-auto" />
            </div>

            {/* Navigation Menu Links */}
            <nav className="flex flex-col gap-1.5 px-0.5">
              {[
                { tab: "capturar", label: "Inicio", icon: <Sparkles className="w-4 h-4" /> },
                { tab: "tickets", label: "Mis Tickets", icon: <Layers className="w-4 h-4" /> },
                { tab: "historial", label: "Gastos", icon: <History className="w-4 h-4" /> },
                { tab: "cuenta", label: "Mi Cuenta", icon: <User className="w-4 h-4" /> },
                isAdmin && { tab: "admin", label: "Admin", icon: <ShieldCheck className="w-4 h-4" /> }
              ].filter(Boolean).map((item) => {
                const isDisabled = (!isProfileComplete && item.tab !== "cuenta") || isNavigationDisabled;
                return (
                  <button
                    key={item.tab}
                    onClick={() => handleTabClick(item.tab)}
                    disabled={isDisabled}
                    className={`flex items-center gap-3 w-full px-4.5 py-3.5 rounded-xl text-[11.5px] uppercase font-display font-extrabold tracking-wider transition-all duration-200 ${
                      isDisabled 
                        ? "opacity-40 cursor-not-allowed text-slate-400 hover:bg-transparent" 
                        : "cursor-pointer"
                    } ${
                      activeTab === item.tab && !isDisabled
                        ? "zt-btn-primary text-white scale-[1.02] shadow-sm shadow-blue-500/20"
                        : isDisabled ? "" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/30"
                    }`}
                  >
                    <span className={`transition-transform duration-150 ${activeTab === item.tab && !isDisabled ? "text-white scale-110" : "text-slate-400 group-hover:scale-110"}`}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="space-y-4 pt-5 border-t border-slate-200/45 px-1">
            {/* Active User Email */}
            <div className="flex flex-col gap-1 bg-white/50 border border-slate-200/40 p-3.5 rounded-2xl shadow-2xs">
              <span className="text-[10px] font-black text-blue-600/70 uppercase tracking-widest font-display">Sesión Activa</span>
              <span className="text-xs font-extrabold text-slate-800 truncate" title={user?.email}>
                {user?.email}
              </span>
            </div>

            {/* Logout Button */}
            <button
              onClick={() => {
                logout();
                toast.success("Has cerrado sesión exitosamente.");
              }}
              className="w-full text-[11px] font-black uppercase tracking-widest text-[#EF4444] bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 py-3 rounded-full transition-all duration-200 cursor-pointer flex items-center justify-center gap-2"
            >
              <LogOut className="w-3.5 h-3.5 stroke-[2.3]" />
              <span>Cerrar Sesión</span>
            </button>

            {/* Bottom Brand Logo stamp */}
            <div className="pt-2 flex justify-center opacity-65 hover:opacity-100 transition-opacity">
              <ZenLogo size={24} className="h-6 w-auto" />
            </div>
          </div>
        </div>
      </aside>

      {/* 2. MOBILE HEADER BAR */}
      <header className="md:hidden bg-white/90 backdrop-blur-md border-b border-slate-200/40 sticky top-0 z-40 shadow-xs w-full">
        <div className="px-4 py-3.5 flex items-center justify-between">
          <div className="cursor-pointer font-bold" onClick={() => handleTabClick("capturar")}>
            <ZenLogo size={28} className="h-7 w-auto" />
          </div>

          <div className="flex items-center gap-3">
            <span className="bg-blue-50/50 text-[#0b53f4] border border-blue-100 text-[10px] font-bold px-2.5 py-1 rounded-md lowercase tracking-wide font-mono">
              {user?.email?.split('@')[0]}
            </span>
            <button
              onClick={() => {
                logout();
                toast.success("Has cerrado sesión exitosamente.");
              }}
              className="text-xs font-bold uppercase tracking-wider text-[#EF4444] bg-rose-50 border border-rose-150/50 hover:bg-rose-100 p-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5 stroke-[2.3]" />
            </button>
          </div>
        </div>
      </header>

      {/* 3. MAIN WORKSPACE VIEW ROUTER (shifted left on desktop to clear sidebar space) */}
      <div className="flex-1 flex flex-col md:pl-66 min-w-0">
        <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
          
          {/* QUOTA LIMIT EXCEEDED WARNING BANNER */}
          {isQuotaExceeded && (
            <div className="mb-6 bg-rose-50/95 border border-rose-200/80 rounded-3xl p-5 shadow-xs text-left flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="text-xs font-black text-rose-800 uppercase tracking-widest flex items-center gap-1.5 font-display text-left">
                  <AlertCircle className="w-4 h-4 text-rose-600 animate-pulse shrink-0" />
                  Límite de Base de Datos Diaria Excedido (Modo Local Seguro Activado)
                </h4>
                <p className="text-[11px] text-rose-700/95 leading-relaxed font-semibold max-w-4xl text-left font-sans">
                  La base de datos en tiempo real de Firebase para este proyecto ha superado la cuota de lectura gratuita diaria (Free daily read units quota exceeded). Para evitar que pierdas tus avances o tu sesión de navegación, <strong>hemos activado de forma transparente el almacenamiento y la simulación local segura (Contingencia Cached)</strong>. Tus datos, tickets escaneados y comprobantes generados se conservarán de manera persistente en la memoria de tu navegador.
                </p>
                {isAdmin && (
                  <p className="text-[10px] text-rose-500 font-mono mt-1 text-left">
                    Sugerencia para Administrador: Puedes aumentar la cuota o actualizar de tu base de datos <strong className="font-bold">factubolt</strong> en:{" "}
                    <a
                      href="https://console.firebase.google.com/project/factubolt/firestore/databases/ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee/data?openUpgradeDialog=true"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-bold text-rose-600 hover:text-rose-800 transition-colors break-all"
                    >
                      https://console.firebase.google.com/project/factubolt/firestore/databases/ai-studio-1f1e2a82-b500-4db2-9cf3-751b301c35ee/data?openUpgradeDialog=true
                    </a>
                  </p>
                )}
              </div>
              <button
                onClick={() => setIsQuotaExceeded(false)}
                className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black px-4 py-2.5 rounded-xl uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap active:scale-97 select-none shrink-0"
              >
                Cerrar Aviso ×
              </button>
            </div>
          )}

          {/* PROFILE COMPLETION REQUIRED BANNER ALERT */}
          {!isProfileComplete && activeTab !== "cuenta" && (
            <div className="mb-6 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-3xl p-5 shadow-xs text-left flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="text-xs font-black text-amber-800 uppercase tracking-widest flex items-center gap-1.5 font-display">
                  <Sparkles className="w-4 h-4 text-amber-600 animate-pulse" />
                  Registro de Prueba (Datos Demostrativos)
                </h4>
                <p className="text-[11px] text-amber-700/90 leading-relaxed font-semibold max-w-4xl">
                  Estás navegando en modo demostrativo. Para habilitar la digitalización de tickets con OCR real en producción, registrar métodos de pago bancarios auténticos con autenticación 3DS y contratar planes reales, debes completar el registro con tus datos fiscales y fiscales reales de tu negocio.
                </p>
              </div>
              <button
                onClick={() => handleTabClick("cuenta")}
                className="bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black px-4.5 py-3 rounded-xl uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap active:scale-97 select-none shrink-0"
              >
                Completar Registro Real →
              </button>
            </div>
          )}

          <div className="bg-transparent rounded-3xl min-h-[500px]">
          
          {/* TAB 1: HOME SCREEN (SCANNER & SIMULATOR) */}
          {activeTab === "capturar" && (
            <HomeScreen
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
          )}

          {/* TAB 2: TICKETS LIST / TRACKER */}
          {activeTab === "tickets" && (
            <div className="bg-white/90 backdrop-blur-sm border border-slate-200/50 rounded-3xl p-5 sm:p-8 md:p-10 shadow-[0_15px_35px_-10px_rgba(37,99,235,0.03)] transition-all">
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
            </div>
          )}

          {/* TAB 3: CONNECTORS / PORTALS */}
          {activeTab === "conectores" && (
            <div className="bg-white/90 backdrop-blur-sm border border-slate-200/50 rounded-3xl p-5 sm:p-8 md:p-10 shadow-[0_15px_35px_-10px_rgba(37,99,235,0.03)] transition-all">
              <ConnectorsList
                connectors={connectors}
                onLearnConnector={onLearnConnector}
                isLoading={isLearningLoading}
              />
            </div>
          )}

          {/* TAB 4: VAULT / INVOICES HISTORIAL */}
          {activeTab === "historial" && (
            <div className="bg-white/90 backdrop-blur-sm border border-slate-200/50 rounded-3xl p-5 sm:p-8 md:p-10 shadow-[0_15px_35px_-10px_rgba(37,99,235,0.03)] transition-all">
              <VaultScreen
                invoices={invoices}
                onTabChange={handleTabClick}
              />
            </div>
          )}

          {/* TAB 5: FISCAL ACCOUNT AND DEBIT PLANS */}
          {activeTab === "cuenta" && (
            <div className="bg-white/90 backdrop-blur-sm border border-slate-200/50 rounded-3xl p-5 sm:p-8 md:p-10 shadow-[0_15px_35px_-10px_rgba(37,99,235,0.03)] transition-all">
              <ProfileForm
                initialProfile={fiscalProfile}
                onSave={handleSaveProfile}
                isSaving={profileSaving}
                currentUserEmail={user?.email}
                invoices={invoices}
                onTabChange={handleTabClick}
              />
            </div>
          )}

          {/* TAB 6: BUSINESS COST AUDITING BOARD */}
          {activeTab === "admin" && isAdmin && (
            <div className="bg-white/90 backdrop-blur-sm border border-slate-200/50 rounded-3xl p-5 sm:p-8 md:p-10 shadow-[0_15px_35px_-10px_rgba(37,99,235,0.03)] transition-all">
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
            </div>
          )}

        </div>
      </main>
      </div>

      {/* 3. FIXED BOTTOM MOBILE NAVIGATION BAR */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200/60 bg-white/95 backdrop-blur-md px-1.5 py-2.5 grid text-[11px] shadow-[0_-8px_20px_-6px_rgba(0,0,0,0.06)]" style={{ gridTemplateColumns: `repeat(${isAdmin ? 5 : 4}, minmax(0, 1fr))` }}>
        {[
          { tab: "capturar", label: "Inicio", icon: <Sparkles className="w-4 h-4" /> },
          { tab: "tickets", label: "Tickets", icon: <Layers className="w-4 h-4" /> },
          { tab: "historial", label: "Gastos", icon: <History className="w-4 h-4" /> },
          { tab: "cuenta", label: "Cuenta", icon: <User className="w-4 h-4" /> },
          isAdmin && { tab: "admin", label: "Admin", icon: <ShieldCheck className="w-4 h-4" /> }
        ].filter(Boolean).map((item) => {
          const isDisabled = (!isProfileComplete && item.tab !== "cuenta") || isNavigationDisabled;
          return (
            <button
              key={item.tab}
              onClick={() => handleTabClick(item.tab)}
              disabled={isDisabled}
              className={`min-w-0 flex flex-col items-center gap-0.5 text-center py-1 transition-all rounded-xl duration-150 ${
                isDisabled 
                  ? "opacity-35 cursor-not-allowed" 
                  : "cursor-pointer"
              } ${
                activeTab === item.tab && !isDisabled
                  ? "text-[#0B53F4] font-bold scale-102" 
                  : "text-slate-400 hover:text-slate-600 font-medium"
              }`}
            >
              <div className={`p-1.5 rounded-lg transition-colors ${activeTab === item.tab && !isDisabled ? "bg-[#0B53F4]/10 text-[#0B53F4]" : "bg-transparent text-slate-400"}`}>
                {item.icon}
              </div>
              <span className="max-w-full truncate text-[9px] leading-tight tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Dashboard;
