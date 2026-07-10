import { ConnectorStrategy } from "./types";
import { oxxoStrategy } from "./strategies/oxxo";

const registry = new Map<string, ConnectorStrategy>();

export function registerConnectorStrategy(strategy: ConnectorStrategy) {
  registry.set(strategy.connectorId, strategy);
}

export function getConnectorStrategy(connectorId: string): ConnectorStrategy | null {
  return registry.get(connectorId) || null;
}

// Auto-register strategies
registerConnectorStrategy(oxxoStrategy);
