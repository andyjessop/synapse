import { describe, expect, it } from 'vitest';
import { classifySqliteRuntimeError } from '../../src/classify';

describe('classifySqliteRuntimeError', () => {
  it('uses phase-specific default kinds for generic errors', () => {
    expect(
      classifySqliteRuntimeError(new Error('x'), 'open', {
        agentName: 'a',
        reactorName: 'r',
      }).kind,
    ).toBe('agent_sqlite_open_failed');
    expect(
      classifySqliteRuntimeError(new Error('x'), 'metadata', {
        agentName: 'a',
        reactorName: 'r',
      }).kind,
    ).toBe('agent_sqlite_open_failed');
    expect(
      classifySqliteRuntimeError(new Error('x'), 'migrate', {
        agentName: 'a',
        reactorName: 'r',
      }).kind,
    ).toBe('agent_sqlite_migration_failed');
    expect(
      classifySqliteRuntimeError(new Error('x'), 'handler_query', {
        agentName: 'a',
        reactorName: 'r',
      }).kind,
    ).toBe('agent_sqlite_query_failed');
    expect(
      classifySqliteRuntimeError(new Error('x'), 'open', {
        agentName: 'a',
        reactorName: 'r',
      }).retryable,
    ).toBe(true);
    expect(
      classifySqliteRuntimeError(new Error('x'), 'metadata', {
        agentName: 'a',
        reactorName: 'r',
      }).retryable,
    ).toBe(true);
    expect(
      classifySqliteRuntimeError(new Error('x'), 'migrate', {
        agentName: 'a',
        reactorName: 'r',
      }).retryable,
    ).toBe(false);
    expect(
      classifySqliteRuntimeError(new Error('x'), 'handler_query', {
        agentName: 'a',
        reactorName: 'r',
      }).retryable,
    ).toBe(false);
  });
});
