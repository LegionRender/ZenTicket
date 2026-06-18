import { useEffect, useState } from "react";
import { db } from "@/services/firebase/client";
import {
  FALLBACK_CONNECTORS,
  FALLBACK_INVOICES,
  FALLBACK_TICKETS,
  getFallbackProfiles
} from "@/workspace/data/workspaceFallbackData";
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where
} from "firebase/firestore";

function createInitialFiscalProfile(user) {
  const isAdminEmail = user.email === "legionrender@gmail.com";
  const isNewSignup = localStorage.getItem("is_new_signup_" + user.uid) === "true";

  return {
    userId: user.uid,
    rfc: isAdminEmail ? "GOMD850101XYZ" : "CABE850101ABC",
    razonSocial: isAdminEmail ? "CONSTRUCTORA LEGION DEL NORTE SA DE CV" : "RICARDO CASTRO BECERRIL",
    regimenFiscal: "626",
    codigoPostal: "02000",
    usoCFDI: "G03",
    plan: "gratuito",
    onboardingCompleted: !isNewSignup,
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
}

export function useWorkspaceData(user) {
  const [fiscalProfile, setFiscalProfile] = useState(null);
  const [connectors, setConnectors] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [allTickets, setAllTickets] = useState([]);
  const [allInvoices, setAllInvoices] = useState([]);

  useEffect(() => {
    if (!user) {
      setFiscalProfile(null);
      return undefined;
    }

    let isActive = true;
    let unsubscribe = () => {};
    const fallbackProfile = createInitialFiscalProfile(user);

    // Firestore can remain pending indefinitely when the named database is
    // unavailable, the browser is offline, or the listener cannot establish
    // its first connection. Do not block the complete workspace forever.
    const fallbackTimer = window.setTimeout(() => {
      if (!isActive) return;
      console.warn("Fiscal profile synchronization timed out; using local fallback.");
      setFiscalProfile((current) => current ?? fallbackProfile);
    }, 5000);

    try {
      const docRef = doc(db, "fiscalProfiles", user.uid);

      unsubscribe = onSnapshot(
        docRef,
        (docSnap) => {
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

            setFiscalProfile({ id: docSnap.id, ...data });
            return;
          }

          setFiscalProfile(fallbackProfile);

          if (!isNewSignup) {
            setDoc(docRef, fallbackProfile, { merge: true }).catch((err) => {
              console.warn("Error background saving initial fiscal profile:", err);
            });
          }
        },
        (err) => {
          if (!isActive) return;
          window.clearTimeout(fallbackTimer);
          console.error("Error watching user fiscal profile:", err);
          setFiscalProfile((current) => current ?? fallbackProfile);
        }
      );
    } catch (err) {
      window.clearTimeout(fallbackTimer);
      console.error("Error starting fiscal profile listener:", err);
      setFiscalProfile((current) => current ?? fallbackProfile);
    }

    return () => {
      isActive = false;
      window.clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "invoices"),
      where("userId", "==", user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setInvoices(list.length ? list : FALLBACK_INVOICES);
    }, (err) => {
      console.error("Error watching invoices:", err);
      setInvoices(FALLBACK_INVOICES);
    });
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "tickets"),
      where("userId", "==", user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setTickets(list.length ? list : FALLBACK_TICKETS);
    }, (err) => {
      console.error("Error watching tickets:", err);
      setTickets(FALLBACK_TICKETS);
    });
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "connectors"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setConnectors(list.length ? list : FALLBACK_CONNECTORS);
    }, (err) => {
      console.error("Error watching connectors:", err);
      setConnectors(FALLBACK_CONNECTORS);
    });
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (user.email !== "legionrender@gmail.com") return;

    const qProfiles = query(collection(db, "fiscalProfiles"));
    const unsubscribeProfiles = onSnapshot(qProfiles, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setAllProfiles(list.length ? list : getFallbackProfiles(user));
    }, (err) => {
      console.error("Firestore Admin Profiles onSnapshot Error:", err);
      setAllProfiles(getFallbackProfiles(user));
    });

    const qTickets = query(collection(db, "tickets"));
    const unsubscribeTickets = onSnapshot(qTickets, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setAllTickets(list.length ? list : FALLBACK_TICKETS);
    }, (err) => {
      console.error("Firestore Admin Tickets onSnapshot Error:", err);
      setAllTickets(FALLBACK_TICKETS);
    });

    const qInvoices = query(collection(db, "invoices"));
    const unsubscribeInvoices = onSnapshot(qInvoices, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setAllInvoices(list.length ? list : FALLBACK_INVOICES);
    }, (err) => {
      console.error("Firestore Admin Invoices onSnapshot Error:", err);
      setAllInvoices(FALLBACK_INVOICES);
    });

    return () => {
      unsubscribeProfiles();
      unsubscribeTickets();
      unsubscribeInvoices();
    };
  }, [user]);

  return {
    allInvoices,
    allProfiles,
    allTickets,
    connectors,
    fiscalProfile,
    invoices,
    setConnectors,
    setFiscalProfile,
    tickets
  };
}
