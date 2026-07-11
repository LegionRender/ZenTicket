import { createServer, IncomingMessage, ServerResponse } from "http";
import { processJob } from "./index";
import { runBrowserSmoke } from "./runtime/browserSmoke";

const port = Number(process.env.PORT || 8080);

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function taskRequestAuthorized(request: IncomingMessage): boolean {
  const configuredToken = process.env.RUNNER_TASK_TOKEN;
  if (!configuredToken) return false;
  const taskToken = request.headers["x-runner-task-token"];
  return taskToken === configuredToken;
}

createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/healthz") {
    sendJson(response, 200, { service: "zenticket-runner", status: "ok" });
    return;
  }

  if (request.method === "GET" && request.url === "/internal/browser-smoke") {
    const result = await runBrowserSmoke();
    sendJson(response, result.healthy ? 200 : 503, result);
    return;
  }

  if (request.method === "POST" && request.url === "/tasks/process") {
    if (!taskRequestAuthorized(request)) {
      sendJson(response, 401, { code: "RUNNER_TASK_UNAUTHORIZED" });
      return;
    }
    try {
      const payload = await readJson(request);
      if (typeof payload.jobId !== "string" || !payload.jobId || payload.jobId.includes("/")) {
        sendJson(response, 400, { code: "INVALID_JOB_ID" });
        return;
      }
      const smoke = await runBrowserSmoke();
      if (!smoke.healthy) {
        sendJson(response, 503, { code: smoke.errorCode, smoke });
        return;
      }
      await processJob(payload.jobId);
      sendJson(response, 202, { jobId: payload.jobId, status: "accepted", smoke });
    } catch (error: any) {
      console.error("[cloud-run] task processing failed", error);
      sendJson(response, 500, { code: "RUNNER_TASK_FAILED", error: error?.message || String(error) });
    }
    return;
  }

  sendJson(response, 404, { code: "NOT_FOUND" });
}).listen(port, "0.0.0.0", () => {
  console.log(`[cloud-run] runner listening on ${port}`);
});
