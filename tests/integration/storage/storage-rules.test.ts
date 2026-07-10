import { initializeTestEnvironment, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { ref, getMetadata, uploadBytes } from "firebase/storage";
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

describe("Storage Security Rules", () => {
  beforeAll(async () => {
    emulatorActive = await isPortOpen(9199, "127.0.0.1");
    if (!emulatorActive) {
      console.warn("⚠️ [Storage Emulator] No está activo en 127.0.0.1:9199. Se omitirán las pruebas reales de Storage.");
      return;
    }

    testEnv = await initializeTestEnvironment({
      projectId: "zenticket-test",
      storage: {
        rules: fs.readFileSync("storage.rules", "utf8"),
        host: "127.0.0.1",
        port: 9199
      }
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  it("Usuario A puede escribir y leer archivos en su propia carpeta users/alice/", async () => {
    if (!emulatorActive) return;

    // Proveer el email para satisfacer la regla de isAdmin() sin excepciones de propiedad indefinida
    const aliceContext = testEnv.authenticatedContext("alice", { email: "alice@example.com", admin: false, role: "user" });
    const aliceStorage = aliceContext.storage();
    const fileRef = ref(aliceStorage, "users/alice/test.pdf");

    const mockFile = new Uint8Array([1, 2, 3]);
    await expect(uploadBytes(fileRef, mockFile)).resolves.toBeDefined();
    await expect(getMetadata(fileRef)).resolves.toBeDefined();
  });

  it("Usuario A no puede escribir en carpeta ajena users/bob/", async () => {
    if (!emulatorActive) return;

    const aliceContext = testEnv.authenticatedContext("alice", { email: "alice@example.com", admin: false, role: "user" });
    const aliceStorage = aliceContext.storage();
    const fileRef = ref(aliceStorage, "users/bob/test.pdf");

    const mockFile = new Uint8Array([1, 2, 3]);
    await expect(uploadBytes(fileRef, mockFile)).rejects.toThrow();
  });

  it("Usuario A no puede leer archivos de users/bob/", async () => {
    if (!emulatorActive) return;

    // Subir archivo a Bob de forma administrativa
    const mockFile = new Uint8Array([1, 2, 3]);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminStorage = context.storage();
      const bobRef = ref(adminStorage, "users/bob/test.pdf");
      await uploadBytes(bobRef, mockFile);
    });

    const aliceContext = testEnv.authenticatedContext("alice", { email: "alice@example.com", admin: false, role: "user" });
    const aliceStorage = aliceContext.storage();
    const fileRef = ref(aliceStorage, "users/bob/test.pdf");

    await expect(getMetadata(fileRef)).rejects.toThrow();
  });

  it("Usuario anónimo no puede leer ni escribir archivos privados", async () => {
    if (!emulatorActive) return;

    const anonContext = testEnv.unauthenticatedContext();
    const anonStorage = anonContext.storage();
    const fileRef = ref(anonStorage, "users/alice/test.pdf");

    const mockFile = new Uint8Array([1, 2, 3]);
    await expect(uploadBytes(fileRef, mockFile)).rejects.toThrow();
    await expect(getMetadata(fileRef)).rejects.toThrow();
  });
});
