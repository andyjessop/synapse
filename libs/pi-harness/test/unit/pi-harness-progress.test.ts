import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AssistantMessageEvent } from '@earendil-works/pi-ai';
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';

import {
  formatPiHarnessProgressLine,
  isPiHarnessProgressEnabled,
  relativizeRepoPrefixesInLine,
  stripPiHarnessProgressPrefix,
  subscribePiHarnessProgress,
} from '../../src/pi-harness-progress';

describe('isPiHarnessProgressEnabled', () => {
  it('is false when unset', () => {
    expect(isPiHarnessProgressEnabled({})).toBe(false);
    expect(isPiHarnessProgressEnabled(undefined)).toBe(false);
  });

  it('accepts 1, true, or yes (case-insensitive, trimmed)', () => {
    expect(isPiHarnessProgressEnabled({ PI_HARNESS_PROGRESS: '1' })).toBe(true);
    expect(isPiHarnessProgressEnabled({ PI_HARNESS_PROGRESS: ' TRUE ' })).toBe(
      true,
    );
    expect(isPiHarnessProgressEnabled({ PI_HARNESS_PROGRESS: 'Yes' })).toBe(
      true,
    );
  });

  it('accepts stderr (stderr-only sink)', () => {
    expect(isPiHarnessProgressEnabled({ PI_HARNESS_PROGRESS: 'stderr' })).toBe(
      true,
    );
  });

  it('rejects other values', () => {
    expect(isPiHarnessProgressEnabled({ PI_HARNESS_PROGRESS: '0' })).toBe(
      false,
    );
    expect(isPiHarnessProgressEnabled({ PI_HARNESS_PROGRESS: 'verbose' })).toBe(
      false,
    );
  });

  it('rejects explicit opt-out spellings', () => {
    expect(isPiHarnessProgressEnabled({ PI_HARNESS_PROGRESS: 'false' })).toBe(
      false,
    );
    expect(isPiHarnessProgressEnabled({ PI_HARNESS_PROGRESS: 'no' })).toBe(
      false,
    );
    expect(isPiHarnessProgressEnabled({ PI_HARNESS_PROGRESS: 'off' })).toBe(
      false,
    );
  });
});

describe('formatPiHarnessProgressLine', () => {
  const freshState = () => ({ lastThinkingLogAt: -750 });

  it('describes read with path', () => {
    const line = formatPiHarnessProgressLine(
      {
        type: 'tool_execution_start',
        toolCallId: 'a',
        toolName: 'read',
        args: { path: 'libs/foo.ts' },
      },
      freshState(),
      0,
    );
    expect(line).toBe('[pi-harness] read libs/foo.ts');
  });

  it('emits tool failure line', () => {
    const line = formatPiHarnessProgressLine(
      {
        type: 'tool_execution_end',
        toolCallId: 'a',
        toolName: 'read',
        args: { path: 'missing.md' },
        result: null,
        isError: true,
      },
      freshState(),
      0,
    );
    expect(line).toBe('[pi-harness] read missing.md failed');
  });

  it('skips successful tool_execution_end', () => {
    expect(
      formatPiHarnessProgressLine(
        {
          type: 'tool_execution_end',
          toolCallId: 'a',
          toolName: 'read',
          args: { path: 'x' },
          result: {},
          isError: false,
        },
        freshState(),
        0,
      ),
    ).toBeUndefined();
  });

  it('relativizes read path against repoRoot', () => {
    const repo = '/Users/w/proj';
    const line = formatPiHarnessProgressLine(
      {
        type: 'tool_execution_start',
        toolCallId: 'a',
        toolName: 'read',
        args: { path: `${repo}/libs/foo.ts` },
      },
      freshState(),
      0,
      repo,
    );
    expect(line).toBe('[pi-harness] read libs/foo.ts');
  });

  it('formats thinking_delta when throttled window elapsed', () => {
    const state = { lastThinkingLogAt: -750 };
    const ame: AssistantMessageEvent = {
      type: 'thinking_delta',
      contentIndex: 0,
      delta: '  trace the imports  ',
      partial: {} as never,
    };
    const line = formatPiHarnessProgressLine(
      {
        type: 'message_update',
        message: { role: 'assistant' } as never,
        assistantMessageEvent: ame,
      },
      state,
      0,
    );
    expect(line).toContain('thinking');
    expect(line).toContain('trace the imports');
  });
});

describe('relativizeRepoPrefixesInLine', () => {
  it('strips repeated repo-root prefixes', () => {
    expect(
      relativizeRepoPrefixesInLine(
        'look at /tmp/r/apps/x and /tmp/r/libs/y',
        '/tmp/r',
      ),
    ).toBe('look at apps/x and libs/y');
  });
});

describe('stripPiHarnessProgressPrefix', () => {
  it('removes the harness prefix', () => {
    expect(stripPiHarnessProgressPrefix('[pi-harness] read a.ts')).toBe(
      'read a.ts',
    );
  });
});

describe('subscribePiHarnessProgress', () => {
  it('does not subscribe when disabled', () => {
    const session = { subscribe: vi.fn() };
    const unsub = subscribePiHarnessProgress(session, {
      enabled: false,
      emitLine: vi.fn(),
    });
    unsub();
    expect(session.subscribe).not.toHaveBeenCalled();
  });

  it('emits rich tool line and skips tool_execution_update', () => {
    let listener: ((event: AgentSessionEvent) => void) | undefined;
    const session = {
      subscribe: vi.fn((l: (event: AgentSessionEvent) => void) => {
        listener = l;
        return vi.fn();
      }),
    };
    const lines: string[] = [];
    subscribePiHarnessProgress(session, {
      enabled: true,
      emitLine: (line) => lines.push(line),
      now: () => 0,
    });
    listener?.({
      type: 'tool_execution_start',
      toolCallId: 'a',
      toolName: 'grep',
      args: { pattern: 'TODO', path: 'src/' },
    });
    listener?.({
      type: 'tool_execution_update',
      toolCallId: 'a',
      toolName: 'grep',
      args: {},
      partialResult: {},
    });
    expect(lines).toEqual(['[pi-harness] grep TODO in src/']);
  });

  it('dedupes consecutive identical lines', () => {
    let listener: ((event: AgentSessionEvent) => void) | undefined;
    const session = {
      subscribe: vi.fn((l: (event: AgentSessionEvent) => void) => {
        listener = l;
        return vi.fn();
      }),
    };
    const lines: string[] = [];
    subscribePiHarnessProgress(session, {
      enabled: true,
      emitLine: (line) => lines.push(line),
      now: () => 0,
    });
    const ev = {
      type: 'tool_execution_start' as const,
      toolCallId: '1',
      toolName: 'read',
      args: { path: 'a.ts' },
    };
    listener?.(ev);
    listener?.({ ...ev, toolCallId: '2' });
    expect(lines).toHaveLength(1);
  });

  it('throttles thinking_delta lines by time', () => {
    let listener: ((event: AgentSessionEvent) => void) | undefined;
    const session = {
      subscribe: vi.fn((l: (event: AgentSessionEvent) => void) => {
        listener = l;
        return vi.fn();
      }),
    };
    const lines: string[] = [];
    let nowMs = 0;
    subscribePiHarnessProgress(session, {
      enabled: true,
      emitLine: (line) => lines.push(line),
      now: () => nowMs,
    });
    const mkEv = (delta: string) =>
      ({
        type: 'message_update' as const,
        message: { role: 'assistant' } as never,
        assistantMessageEvent: {
          type: 'thinking_delta',
          contentIndex: 0,
          delta,
          partial: {} as never,
        } satisfies AssistantMessageEvent,
      }) as AgentSessionEvent;
    listener?.(mkEv('a'));
    listener?.(mkEv('b'));
    expect(lines.filter((l) => l.includes('thinking'))).toHaveLength(1);
    nowMs = 800;
    listener?.(mkEv('c'));
    expect(lines.filter((l) => l.includes('thinking'))).toHaveLength(2);
  });

  it('writes rolling snapshot instead of emitLine when snapshotPath set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pi-harness-snap-'));
    try {
      const file = join(dir, 'p.json');
      let listener: ((event: AgentSessionEvent) => void) | undefined;
      const session = {
        subscribe: vi.fn((l: (event: AgentSessionEvent) => void) => {
          listener = l;
          return vi.fn();
        }),
      };
      const emitted: string[] = [];
      subscribePiHarnessProgress(session, {
        enabled: true,
        emitLine: (line) => emitted.push(line),
        snapshotPath: file,
        snapshotLineCount: 3,
        repoRoot: '/tmp/repo',
        now: () => 0,
      });
      for (let i = 0; i < 5; i++) {
        listener?.({
          type: 'tool_execution_start',
          toolCallId: `c${i}`,
          toolName: 'read',
          args: { path: `f${i}.ts` },
        });
      }
      expect(emitted).toHaveLength(0);
      const snap = JSON.parse(readFileSync(file, 'utf8')) as {
        lines: string[];
      };
      expect(snap.lines).toEqual(['read f2.ts', 'read f3.ts', 'read f4.ts']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns unsubscribe from session.subscribe', () => {
    const inner = vi.fn();
    const session = {
      subscribe: vi.fn(() => inner),
    };
    const unsub = subscribePiHarnessProgress(session, {
      enabled: true,
      emitLine: vi.fn(),
    });
    unsub();
    expect(inner).toHaveBeenCalledTimes(1);
  });
});
