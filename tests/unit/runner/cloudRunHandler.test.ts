import { createServer, Server } from "http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCloudRunHandler } from "../../../runner/src/runtime/cloudRunHandler";

const unhealthySmoke = {
  healthy: false,
  checkedAt: "2026-07-12T00:00:00.000Z",
  playwrightVersion: "1.61.1",
  executablePath: "/ms-playwright/chromium",
  errorCode: "PLAYWRIGHT_BROWSER_LAUNCH_FAILED" as const,
  error: "launch failed"
};

const servers: Server[] = [];

async function withHandler(handler: ReturnType<typeof createCloudRunHandler>) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("Cloud Run task handler", () => {
  it("rejects a task without the application token", async () => {
    const processJob = vi.fn();
    const baseUrl = await withHandler(createCloudRunHandler({
      taskToken: "task-secret",
      processJob,
      processConnectorDiscovery: vi.fn(),
      runBrowserSmoke: vi.fn()
    }));

    const response = await fetch(`${baseUrl}/tasks/process`, { method: "POST", body: JSON.stringify({ jobId: "job-1" }) });
    expect(response.status).toBe(401);
    expect(processJob).not.toHaveBeenCalled();
  });

  it("does not invoke processJob when the browser smoke fails", async () => {
    const processJob = vi.fn();
    const baseUrl = await withHandler(createCloudRunHandler({
      taskToken: "task-secret",
      processJob,
      processConnectorDiscovery: vi.fn(),
      runBrowserSmoke: vi.fn().mockResolvedValue(unhealthySmoke)
    }));

    const response = await fetch(`${baseUrl}/tasks/process`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-runner-task-token": "task-secret" },
      body: JSON.stringify({ jobId: "job-1" })
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "PLAYWRIGHT_BROWSER_LAUNCH_FAILED" });
    expect(processJob).not.toHaveBeenCalled();
  });

  it("acknowledges queued discovery tasks without running JIT", async () => {
    const processConnectorDiscovery = vi.fn();
    const runBrowserSmoke = vi.fn();
    const baseUrl = await withHandler(createCloudRunHandler({
      taskToken: "task-secret",
      processJob: vi.fn(),
      processConnectorDiscovery,
      runBrowserSmoke
    }));

    const response = await fetch(`${baseUrl}/tasks/discover`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-runner-task-token": "task-secret" },
      body: JSON.stringify({ discoveryId: "discovery-1" })
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: "jit_governance_frozen" });
    expect(runBrowserSmoke).not.toHaveBeenCalled();
    expect(processConnectorDiscovery).not.toHaveBeenCalled();
  });
});
