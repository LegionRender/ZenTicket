import { db } from "@/services/firebase/client";
import { collection, deleteDoc, doc, setDoc } from "firebase/firestore";

export async function createTicket(user, ticketData) {
  const ticketRef = doc(collection(db, "tickets"));
  const ticketPayload = {
    ...ticketData,
    createdAt: ticketData.createdAt || new Date().toISOString(),
    userId: user.uid
  };

  await setDoc(ticketRef, ticketPayload);
  return { id: ticketRef.id, ...ticketPayload };
}

export async function updateTicket(ticketId, updates) {
  await setDoc(doc(db, "tickets", ticketId), updates, { merge: true });
}

export async function deleteTicket(ticketId) {
  await deleteDoc(doc(db, "tickets", ticketId));
}
