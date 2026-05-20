import { beforeEach, describe, expect, it, vi } from 'vitest';

const listSynapseDevProcesses = vi.hoisted(() => vi.fn());
const killSynapseDevProcessPids = vi.hoisted(() => vi.fn());
const confirm = vi.hoisted(() => vi.fn());
const cancel = vi.hoisted(() => vi.fn());
const isCancel = vi.hoisted(() => vi.fn(() => false));

vi.mock('dev-cli-shared', () => ({
  listSynapseDevProcesses,
  killSynapseDevProcessPids,
}));

vi.mock('@clack/prompts', () => ({
  confirm,
  cancel,
  isCancel,
  log: {
    warn: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
  },
}));

const { confirmStopRunningDevProcesses } = await import(
  './dev-running-processes.js'
);

describe('confirmStopRunningDevProcesses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listSynapseDevProcesses.mockReturnValue([]);
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  });

  it('no-ops when nothing is running', async () => {
    await confirmStopRunningDevProcesses('/repo');
    expect(confirm).not.toHaveBeenCalled();
    expect(killSynapseDevProcessPids).not.toHaveBeenCalled();
  });

  it('kills without prompting when SYNAPSE_DEV_KILL_ORPHANS=1', async () => {
    listSynapseDevProcesses.mockReturnValue([
      { pid: 99, command: 'node nx run worker:start' },
    ]);
    await confirmStopRunningDevProcesses('/repo', {
      SYNAPSE_DEV_KILL_ORPHANS: '1',
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(killSynapseDevProcessPids).toHaveBeenCalledWith([99]);
  });

  it('kills when the user confirms', async () => {
    listSynapseDevProcesses.mockReturnValue([
      { pid: 42, command: 'node nx run ingress:start' },
    ]);
    confirm.mockResolvedValue(true);
    await confirmStopRunningDevProcesses('/repo', {});
    expect(confirm).toHaveBeenCalled();
    expect(killSynapseDevProcessPids).toHaveBeenCalledWith([42]);
  });

  it('throws when the user declines', async () => {
    listSynapseDevProcesses.mockReturnValue([{ pid: 1, command: 'worker' }]);
    confirm.mockResolvedValue(false);
    await expect(confirmStopRunningDevProcesses('/repo', {})).rejects.toThrow(
      /cancelled/i,
    );
    expect(killSynapseDevProcessPids).not.toHaveBeenCalled();
  });
});
