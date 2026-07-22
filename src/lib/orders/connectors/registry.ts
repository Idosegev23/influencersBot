// Registry keyed by platform. Adapters self-register at module load via registerConnector().
// Consumers of getConnector() must side-effect-import the adapter modules first.
import type { OrderConnector, StorePlatform } from './types';

const registry = new Map<StorePlatform, OrderConnector>();

export function registerConnector(connector: OrderConnector): void {
  registry.set(connector.platform, connector);
}

export function getConnector(platform: StorePlatform): OrderConnector {
  const connector = registry.get(platform);
  if (!connector) {
    throw new Error(`No order connector registered for platform: ${platform}`);
  }
  return connector;
}
