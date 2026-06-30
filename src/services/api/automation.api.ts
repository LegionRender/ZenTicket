import { getApiUrl } from "./api-client";

export interface RunAutomationParams {
  ticket: any;
  profile: any;
  connector: any;
}

/**
 * Runs the automatic billing sequence on the official merchant portal.
 */
export const runAutomation = async ({
  ticket,
  profile,
  connector
}: RunAutomationParams): Promise<Response> => {
  const response = await fetch(getApiUrl("/api/automation/run"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticket,
      profile,
      connector,
    }),
  });

  if (!response.ok) {
    throw new Error("No fue posible completar la solicitud en el portal del comercio. Revisa los datos del ticket o solicita revisión manual.");
  }

  return response;
};
