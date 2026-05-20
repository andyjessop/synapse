import type { RuntimePool } from 'runtime-store';

import {
  type TerminalWaitResult,
  waitForTerminalEventTypes,
} from './terminal.js';

export async function waitForScenarioTerminal(input: {
  pool: RuntimePool;
  rootId: string;
  terminalEventTypes?: readonly string[];
  pollMs: number;
  timeoutMs?: number;
  onPollTick?: () => void | Promise<void>;
}): Promise<TerminalWaitResult> {
  return waitForTerminalEventTypes({
    pool: input.pool,
    rootId: input.rootId,
    terminalEventTypes: input.terminalEventTypes,
    pollMs: input.pollMs,
    timeoutMs: input.timeoutMs,
    onPollTick: input.onPollTick,
  });
}
