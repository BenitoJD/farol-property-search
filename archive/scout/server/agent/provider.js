import { DemoProvider } from './mock-provider.js';
import { LiveProvider } from './live-provider.js';

export function createProvider({ config, logger }) {
  if (config.mode === 'live') {
    return new LiveProvider({ config, logger });
  }
  return new DemoProvider({ config, logger });
}
