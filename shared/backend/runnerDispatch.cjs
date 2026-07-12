function requiredString(value, code) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(code);
  return normalized;
}

function normalizeRunnerDispatchConfig(input) {
  const queue = requiredString(input?.queue, "RUNNER_TASK_DISPATCH_CONFIG_MISSING");
  const location = requiredString(input?.location, "RUNNER_TASK_DISPATCH_CONFIG_MISSING");
  const targetUrl = requiredString(input?.targetUrl, "RUNNER_TASK_DISPATCH_CONFIG_MISSING").replace(/\/$/, "");
  const invokerServiceAccount = requiredString(input?.invokerServiceAccount, "RUNNER_TASK_DISPATCH_CONFIG_MISSING");
  const taskToken = requiredString(input?.taskToken, "RUNNER_TASK_DISPATCH_CONFIG_MISSING");
  if (!/^https:\/\//.test(targetUrl)) throw new Error("RUNNER_URL_INVALID");
  return { queue, location, targetUrl, invokerServiceAccount, taskToken };
}

function buildCloudRunTask({ projectId, jobId, deliveryId, config }) {
  const project = requiredString(projectId, "RUNNER_TASK_PROJECT_MISSING");
  const safeJobId = requiredString(jobId, "RUNNER_TASK_JOB_ID_MISSING");
  const safeDeliveryId = requiredString(deliveryId, "RUNNER_TASK_DELIVERY_ID_MISSING");
  const normalizedConfig = normalizeRunnerDispatchConfig(config);
  const parent = `projects/${project}/locations/${normalizedConfig.location}/queues/${normalizedConfig.queue}`;
  const taskId = `invoice-${safeDeliveryId}`.replace(/[^A-Za-z0-9_-]/g, "-");
  const taskName = `${parent}/tasks/${taskId}`;

  return {
    parent,
    taskName,
    task: {
      name: taskName,
      httpRequest: {
        httpMethod: "POST",
        url: `${normalizedConfig.targetUrl}/tasks/process`,
        headers: {
          "Content-Type": "application/json",
          "X-Runner-Task-Token": normalizedConfig.taskToken
        },
        oidcToken: {
          serviceAccountEmail: normalizedConfig.invokerServiceAccount,
          audience: normalizedConfig.targetUrl
        },
        body: Buffer.from(JSON.stringify({ jobId: safeJobId, deliveryId: safeDeliveryId }), "utf8").toString("base64")
      }
    }
  };
}

module.exports = { normalizeRunnerDispatchConfig, buildCloudRunTask };
