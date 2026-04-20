import { notifierAgentDefinition } from 'example-agent-notifier';
import { describe, expect, it, vi } from 'vitest';

describe('example-agent-notifier notify-ticket reactor', () => {
  it('emits ticket.notified.v1 with deduped external id', async () => {
    const emit = vi.fn().mockResolvedValue({ id: 'evt-notified' });
    const reactor = notifierAgentDefinition.reactors[0];
    await reactor?.handler(
      {
        id: 'evt-opened-1',
        type: 'ticket.opened.v1',
        data: { ticket_id: 'DEV-1', title: 'Test', body: '' },
        source: 'synapse://example/agent-notifier/ingress',
        externalId: 'ticket-opened:DEV-1',
        rootId: 'evt-opened-1',
        createdAt: new Date().toISOString(),
      },
      {
        agentName: 'example-agent-notifier',
        reactorName: 'notify-ticket',
        input: {} as never,
        run: { id: 'run-1', attempt: 1 },
        emit,
      },
    );
    expect(emit).toHaveBeenCalledWith(
      'ticket.notified.v1',
      expect.objectContaining({
        ticket_id: 'DEV-1',
        input_event_id: 'evt-opened-1',
      }),
      { externalId: 'ticket-notified:evt-opened-1' },
    );
  });
});
