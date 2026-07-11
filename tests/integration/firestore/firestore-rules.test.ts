import { initializeTestEnvironment, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import fs from "fs";
import net from "net";

let testEnv: RulesTestEnvironment;
let emulatorActive = false;

const isPortOpen = (port: number, host: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onError = () => {
      socket.destroy();
      resolve(false);
    };
    socket.setTimeout(500);
    socket.once("error", onError);
    socket.once("timeout", onError);
    socket.connect(port, host, () => {
      socket.end();
      resolve(true);
    });
  });
};

describe("Firestore Security Rules", () => {
  beforeAll(async () => {
    emulatorActive = await isPortOpen(8080, "127.0.0.1");
    if (!emulatorActive) {
      console.warn("⚠️ [Firestore Emulator] No está activo en 127.0.0.1:8080. Se omitirán las pruebas reales de reglas.");
      return;
    }

    testEnv = await initializeTestEnvironment({
      projectId: "zenticket-test",
      firestore: {
        rules: fs.readFileSync("firestore.rules", "utf8"),
        host: "127.0.0.1",
        port: 8080
      }
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();
    }
  });

  it("Usuario A puede leer su perfil e información fiscal", async () => {
    if (!emulatorActive) return;

    const aliceContext = testEnv.authenticatedContext("alice", { email: "alice@example.com", admin: false, role: "user" });
    const aliceDb = aliceContext.firestore();

    const userDocRef = doc(aliceDb, "users", "alice");
    await expect(getDoc(userDocRef)).resolves.toBeDefined();

    const fiscalDocRef = doc(aliceDb, "fiscalProfiles", "alice");
    await expect(getDoc(fiscalDocRef)).resolves.toBeDefined();
  });

  it("Usuario A no puede leer perfil o información fiscal de Usuario B", async () => {
    if (!emulatorActive) return;

    const aliceContext = testEnv.authenticatedContext("alice", { email: "alice@example.com", admin: false, role: "user" });
    const aliceDb = aliceContext.firestore();

    const userDocRef = doc(aliceDb, "users", "bob");
    await expect(getDoc(userDocRef)).rejects.toThrow();

    const fiscalDocRef = doc(aliceDb, "fiscalProfiles", "bob");
    await expect(getDoc(fiscalDocRef)).rejects.toThrow();
  });

  it("Usuario A puede crear y leer sus propios tickets", async () => {
    if (!emulatorActive) return;

    const aliceContext = testEnv.authenticatedContext("alice", { email: "alice@example.com", admin: false, role: "user" });
    const aliceDb = aliceContext.firestore();

    const ticketRef = doc(aliceDb, "tickets", "ticket_alice");
    await expect(setDoc(ticketRef, { userId: "alice", amount: 100 })).resolves.not.toThrow();
    await expect(getDoc(ticketRef)).resolves.toBeDefined();
  });

  it("Usuario A no puede crear un ticket con el userId de Usuario B", async () => {
    if (!emulatorActive) return;

    const aliceContext = testEnv.authenticatedContext("alice", { email: "alice@example.com", admin: false, role: "user" });
    const aliceDb = aliceContext.firestore();

    const ticketRef = doc(aliceDb, "tickets", "ticket_bob");
    await expect(setDoc(ticketRef, { userId: "bob", amount: 200 })).rejects.toThrow();
  });

  it("Usuario A no puede leer tickets de Usuario B", async () => {
    if (!emulatorActive) return;

    // Crear ticket de Bob usando contexto administrativo
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, "tickets", "ticket_bob"), { userId: "bob", amount: 150 });
    });

    const aliceContext = testEnv.authenticatedContext("alice", { email: "alice@example.com", admin: false, role: "user" });
    const aliceDb = aliceContext.firestore();

    const ticketRef = doc(aliceDb, "tickets", "ticket_bob");
    await expect(getDoc(ticketRef)).rejects.toThrow();
  });

  it("Usuario anónimo no puede leer ni escribir datos privados", async () => {
    if (!emulatorActive) return;

    const anonContext = testEnv.unauthenticatedContext();
    const anonDb = anonContext.firestore();

    const ticketRef = doc(anonDb, "tickets", "ticket_anon");
    await expect(getDoc(ticketRef)).rejects.toThrow();
    await expect(setDoc(ticketRef, { userId: "anon", amount: 50 })).rejects.toThrow();
  });

  it("Cliente no puede crear ni modificar invoice_jobs", async () => {
    if (!emulatorActive) return;
    const aliceDb = testEnv.authenticatedContext("alice", { email: "alice@example.com", admin: false, role: "user" }).firestore();
    const jobRef = doc(aliceDb, "invoice_jobs", "job_alice");

    await expect(setDoc(jobRef, { userId: "alice", ticketId: "ticket_alice", status: "pending" })).rejects.toThrow();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "invoice_jobs", "job_alice"), { userId: "alice", ticketId: "ticket_alice", status: "waiting_user_captcha" });
    });
    await expect(updateDoc(jobRef, { status: "captcha_submitted" })).rejects.toThrow();
  });

  it("Cliente no puede escribir invoices ni campos fiscales protegidos", async () => {
    if (!emulatorActive) return;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "tickets", "ticket_protected"), { userId: "alice", total: 100, status: "queued_for_runner" });
    });

    const aliceDb = testEnv.authenticatedContext("alice", { email: "alice@example.com", admin: false, role: "user" }).firestore();
    await expect(setDoc(doc(aliceDb, "users", "alice", "invoices", "invoice_alice"), { userId: "alice", ticketId: "ticket_protected" })).rejects.toThrow();
    await expect(updateDoc(doc(aliceDb, "tickets", "ticket_protected"), { invoiceId: "inventado" })).rejects.toThrow();
    await expect(updateDoc(doc(aliceDb, "tickets", "ticket_protected"), { status: "cfdi_validated" })).rejects.toThrow();
  });
});
