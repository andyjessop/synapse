import { describe, expect, it } from 'vitest';

import {
  AdapterParamsNotSerializableError,
  assertJsonSerializable,
} from '../../src/assert-json-serializable.js';
import { AdapterInvokeError, invokeAdapter } from '../../src/invoke-adapter.js';

describe('assertJsonSerializable', () => {
  it('rejects bigint with fieldPath and valueKind', () => {
    expect(() => assertJsonSerializable({ id: 1n }, 'params')).toThrow(
      AdapterParamsNotSerializableError,
    );
    try {
      assertJsonSerializable({ id: 1n }, 'params');
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterParamsNotSerializableError);
      const e = error as AdapterParamsNotSerializableError;
      expect(e.fieldPath).toBe('params.id');
      expect(e.valueKind).toBe('bigint');
    }
  });

  it('rejects undefined in objects', () => {
    try {
      assertJsonSerializable({ x: undefined }, 'params');
    } catch (error) {
      expect((error as AdapterParamsNotSerializableError).fieldPath).toBe(
        'params.x',
      );
      expect((error as AdapterParamsNotSerializableError).valueKind).toBe(
        'undefined',
      );
    }
  });

  it('rejects circular references', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    try {
      assertJsonSerializable(circular, 'params');
    } catch (error) {
      expect((error as AdapterParamsNotSerializableError).valueKind).toBe(
        'circular',
      );
    }
  });
});

describe('invokeAdapter', () => {
  it('throws AdapterInvokeError before port.invoke for bad params', async () => {
    await expect(
      invokeAdapter(
        { invoke: async () => ({}) },
        {
          agentName: 'agent-reviewer',
          source: 'synapse.adapters.gitlab.v1',
          method: 'fetchChanges',
          params: { projectId: 1n } as unknown as Record<string, unknown>,
        },
      ),
    ).rejects.toMatchObject({
      code: 'adapter_params_not_serializable',
      details: expect.objectContaining({
        agentName: 'agent-reviewer',
        valueKind: 'bigint',
      }),
    });
  });
});
