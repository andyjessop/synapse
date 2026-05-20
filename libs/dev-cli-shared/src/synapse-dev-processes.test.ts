import { describe, expect, it, vi } from 'vitest';

const execSync = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execSync,
}));

import {
  killSynapseDevProcessPids,
  listSynapseDevProcesses,
} from './synapse-dev-processes.js';

describe('listSynapseDevProcesses', () => {
  it('parses pgrep lines and dedupes by pid', () => {
    execSync.mockReturnValue('50012 node nx run worker:start\n');

    const listed = listSynapseDevProcesses('/repo/synapse');
    expect(listed).toEqual([
      {
        pid: 50_012,
        command: 'node nx run worker:start',
      },
    ]);
    expect(execSync).toHaveBeenCalled();
  });

  it('returns empty when pgrep finds nothing', () => {
    execSync.mockReturnValue('');
    expect(listSynapseDevProcesses('/repo/synapse')).toEqual([]);
  });
});

describe('killSynapseDevProcessPids', () => {
  it('sends SIGTERM to each pid', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    killSynapseDevProcessPids([111, 222]);
    expect(kill).toHaveBeenCalledWith(111, 'SIGTERM');
    expect(kill).toHaveBeenCalledWith(222, 'SIGTERM');
    kill.mockRestore();
  });
});
