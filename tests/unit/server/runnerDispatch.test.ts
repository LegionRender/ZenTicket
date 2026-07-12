import { describe, expect, it } from "vitest";

const { buildCloudRunTask, normalizeRunnerDispatchConfig } = require("../../../shared/backend/runnerDispatch.cjs");

describe("Cloud Tasks dispatch contract", () => {
  const config = {
    queue: "invoice-jobs",
    location: "us-central1",
    targetUrl: "https://runner-abc-uc.a.run.app/",
    invokerServiceAccount: "tasks-invoker@factubolt.iam.gserviceaccount.com",
    taskToken: "secret-kept-in-secret-manager"
  };

  it("uses an HTTPS runner URL, an OIDC audience, and a deterministic task name", () => {
    const taskRequest = buildCloudRunTask({
      projectId: "factubolt",
      jobId: "ticket-123",
      deliveryId: "outbox/123",
      config
    });

    expect(taskRequest.parent).toBe("projects/factubolt/locations/us-central1/queues/invoice-jobs");
    expect(taskRequest.taskName).toMatch(/\/tasks\/invoice-outbox-123$/);
    expect(taskRequest.task.httpRequest).toMatchObject({
      httpMethod: "POST",
      url: "https://runner-abc-uc.a.run.app/tasks/process",
      oidcToken: {
        serviceAccountEmail: "tasks-invoker@factubolt.iam.gserviceaccount.com",
        audience: "https://runner-abc-uc.a.run.app"
      }
    });
    expect(taskRequest.task.httpRequest.headers["X-Runner-Task-Token"]).toBe(config.taskToken);
    expect(Buffer.from(taskRequest.task.httpRequest.body, "base64").toString("utf8")).toBe('{"jobId":"ticket-123","deliveryId":"outbox/123"}');
  });

  it("fails closed for a non-HTTPS runner URL or incomplete dispatch configuration", () => {
    expect(() => normalizeRunnerDispatchConfig({ ...config, targetUrl: "http://runner.internal" })).toThrow("RUNNER_URL_INVALID");
    expect(() => normalizeRunnerDispatchConfig({ ...config, taskToken: "" })).toThrow("RUNNER_TASK_DISPATCH_CONFIG_MISSING");
  });
});
