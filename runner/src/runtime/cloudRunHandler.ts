import { IncomingMessage, ServerResponse } from "http";
import { BrowserSmokeResult } from "./browserSmoke";

type JobProcessor = (id: string) => Promise<void>;
type BrowserSmoke = () => Promise<BrowserSmokeResult>;

export interface CloudRunHandlerDependencies {
  taskToken: string | undefined;
  processJob: JobProcessor;
  processConnectorDiscovery: JobProcessor;
  runBrowserSmoke: BrowserSmoke;
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function taskRequestAuthorized(request: IncomingMessage, configuredToken: string | undefined): boolean {
  return Boolean(configuredToken) && request.headers["x-runner-task-token"] === configuredToken;
}

export function createCloudRunHandler(dependencies: CloudRunHandlerDependencies) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method === "GET" && request.url === "/healthz") {
      sendJson(response, 200, { service: "zenticket-runner", status: "ok" });
      return;
    }

    if (request.method === "GET" && request.url === "/internal/browser-smoke") {
      const result = await dependencies.runBrowserSmoke();
      sendJson(response, result.healthy ? 200 : 503, result);
      return;
    }

    const isProcessTask = request.method === "POST" && request.url === "/tasks/process";
    const isDiscoveryTask = request.method === "POST" && request.url === "/tasks/discover";
    if (!isProcessTask && !isDiscoveryTask) {
      sendJson(response, 404, { code: "NOT_FOUND" });
      return;
    }
    if (!taskRequestAuthorized(request, dependencies.taskToken)) {
      sendJson(response, 401, { code: "RUNNER_TASK_UNAUTHORIZED" });
      return;
    }



    const idField = isProcessTask ? "jobId" : "discoveryId";
    const invalidCode = isProcessTask ? "INVALID_JOB_ID" : "INVALID_DISCOVERY_ID";
    const failedCode = isProcessTask ? "RUNNER_TASK_FAILED" : "CONNECTOR_DISCOVERY_FAILED";
    try {
      const payload = await readJson(request);
      const id = payload[idField];
      if (typeof id !== "string" || !id || id.includes("/")) {
        sendJson(response, 400, { code: invalidCode });
        return;
      }
      const smoke = await dependencies.runBrowserSmoke();
      if (!smoke.healthy) {
        sendJson(response, 503, { code: smoke.errorCode, smoke });
        return;
      }
      await (isProcessTask ? dependencies.processJob : dependencies.processConnectorDiscovery)(id);
      sendJson(response, 202, { [idField]: id, status: "accepted", smoke });
    } catch (error: any) {
      console.error("[cloud-run] task processing failed", error);
      sendJson(response, 500, { code: failedCode, error: error?.message || String(error) });
    }
  };
}
