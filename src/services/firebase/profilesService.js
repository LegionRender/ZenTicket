import { db } from "@/services/firebase/client";
import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";

export async function recoverUserHistoryByMatchingDetails(user, targetEmail, targetPhone, targetRfc) {
  if (!user) {
    return {
      migratedConnectors: 0,
      migratedInvoices: 0,
      migratedTickets: 0,
      recovered: false
    };
  }

  const emailToMatch = (targetEmail || "").trim().toLowerCase();
  const phoneToMatch = (targetPhone || "").trim();
  const rfcToMatch = (targetRfc || "").trim().toUpperCase();

  const isMockRfc = rfcToMatch === "" || rfcToMatch === "CABE850101ABC" || rfcToMatch === "GOMD850101XYZ";
  const isMockPhone = phoneToMatch === "" || phoneToMatch === "+52 55 1234 5678" || phoneToMatch === "5512345678";

  if (!emailToMatch && isMockPhone && isMockRfc) {
    return {
      migratedConnectors: 0,
      migratedInvoices: 0,
      migratedTickets: 0,
      recovered: false
    };
  }

  const matchedOldUserIds = new Set();
  const profilesSnapshot = await getDocs(query(collection(db, "fiscalProfiles")));

  profilesSnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const oldUid = docSnap.id;

    if (oldUid === user.uid) {
      return;
    }

    const profileEmail = (data.correoElectronico || "").trim().toLowerCase();
    const profileRecepcion = (data.correoRecepcion || "").trim().toLowerCase();
    const profilePhone = (data.telefono || "").trim();
    const profileRfc = (data.rfc || "").trim().toUpperCase();

    const emailMatched = emailToMatch && (profileEmail === emailToMatch || profileRecepcion === emailToMatch);
    const phoneMatched = !isMockPhone && phoneToMatch && profilePhone === phoneToMatch;
    const rfcMatched = !isMockRfc && rfcToMatch && profileRfc === rfcToMatch;

    if (emailMatched || phoneMatched || rfcMatched) {
      matchedOldUserIds.add(oldUid);
    }
  });

  if (matchedOldUserIds.size === 0) {
    return {
      migratedConnectors: 0,
      migratedInvoices: 0,
      migratedTickets: 0,
      recovered: false
    };
  }

  let migratedTickets = 0;
  let migratedInvoices = 0;
  let migratedConnectors = 0;
  let recoveredProfileData = null;

  for (const oldUid of matchedOldUserIds) {
    const oldProfileDoc = profilesSnapshot.docs.find((item) => item.id === oldUid);
    if (oldProfileDoc) {
      recoveredProfileData = oldProfileDoc.data();
    }

    const ticketsSnapshot = await getDocs(query(collection(db, "tickets"), where("userId", "==", oldUid)));
    for (const ticketDoc of ticketsSnapshot.docs) {
      await setDoc(doc(db, "tickets", ticketDoc.id), { userId: user.uid }, { merge: true });
      migratedTickets++;
    }

    const invoicesSnapshot = await getDocs(query(collection(db, "invoices"), where("userId", "==", oldUid)));
    for (const invoiceDoc of invoicesSnapshot.docs) {
      await setDoc(doc(db, "invoices", invoiceDoc.id), { userId: user.uid }, { merge: true });
      migratedInvoices++;
    }

    const connectorsSnapshot = await getDocs(query(collection(db, "connectors"), where("userId", "==", oldUid)));
    for (const connectorDoc of connectorsSnapshot.docs) {
      await setDoc(doc(db, "connectors", connectorDoc.id), { userId: user.uid }, { merge: true });
      migratedConnectors++;
    }

    const trainingsSnapshot = await getDocs(query(collection(db, "automation_trainings"), where("userId", "==", oldUid)));
    for (const trainingDoc of trainingsSnapshot.docs) {
      await setDoc(doc(db, "automation_trainings", trainingDoc.id), { userId: user.uid }, { merge: true });
    }
  }

  if (recoveredProfileData) {
    await setDoc(
      doc(db, "fiscalProfiles", user.uid),
      {
        ...recoveredProfileData,
        updatedAt: new Date().toISOString(),
        userId: user.uid
      },
      { merge: true }
    );
  }

  return {
    migratedConnectors,
    migratedInvoices,
    migratedTickets,
    recovered: true
  };
}

export async function saveFiscalProfile(user, profileData) {
  const updatedProfile = {
    ...profileData,
    onboardingCompleted: true,
    updatedAt: new Date().toISOString(),
    userId: user.uid
  };

  await setDoc(doc(db, "fiscalProfiles", user.uid), updatedProfile, { merge: true });
  return updatedProfile;
}

export async function completeOnboardingProfile(user, onboardingData) {
  await setDoc(
    doc(db, "users", user.uid),
    {
      name: onboardingData.name,
      telefono: onboardingData.telefono,
      photoURL: onboardingData.photoURL,
      onboardingCompleted: true,
      updatedAt: onboardingData.updatedAt
    },
    { merge: true }
  );

  const fiscalProfile = {
    userId: user.uid,
    name: onboardingData.name,
    telefono: onboardingData.telefono,
    photoURL: onboardingData.photoURL,
    plan: onboardingData.plan,
    rfc: onboardingData.rfc,
    razonSocial: onboardingData.razonSocial,
    regimenFiscal: onboardingData.regimenFiscal,
    codigoPostal: onboardingData.codigoPostal,
    usoCFDI: onboardingData.usoCFDI,
    correoRecepcion: onboardingData.correoRecepcion,
    onboardingCompleted: true,
    updatedAt: onboardingData.updatedAt
  };

  await setDoc(doc(db, "fiscalProfiles", user.uid), fiscalProfile, { merge: true });
  return fiscalProfile;
}
