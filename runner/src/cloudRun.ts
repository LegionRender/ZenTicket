import { createServer } from "http";
import { processJob } from "./index";
import { processConnectorDiscovery } from "./discovery/processDiscovery";
import { runBrowserSmoke } from "./runtime/browserSmoke";
import { createCloudRunHandler } from "./runtime/cloudRunHandler";

const port = Number(process.env.PORT || 8080);

createServer(createCloudRunHandler({
  taskToken: process.env.RUNNER_TASK_TOKEN,
  processJob,
  processConnectorDiscovery,
  runBrowserSmoke
})).listen(port, "0.0.0.0", () => {
  console.log(`[cloud-run] runner listening on ${port}`);
});
