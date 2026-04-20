import { describe, expect, it } from 'vitest';
import { formatRunRecordFlow } from './format-run-flow.js';
import type { DevOnceRunRecord } from './run-record.js';

const reviewPrRecord: DevOnceRunRecord = {
  version: 1,
  recordedAt: '2026-05-17T10:37:22.000Z',
  scenarioId: 'review-pr/gitlab-synapse',
  inputEventId: 'evt_input',
  rootId: 'evt_input',
  events: [
    {
      id: 'evt_input',
      type: 'pr.received.v1',
      source: 'synapse://agent/agent-reviewer/ingress',
      externalId: 'gitlab:merge-request:101:9001:open:2026-05-17T10:37:19.339Z',
      rootId: 'evt_input',
      createdAt: '2026-05-17T10:37:19.341Z',
      data: { provider: 'gitlab' },
    },
    {
      id: 'evt_review',
      type: 'pr.reviewed.v1',
      source: 'synapse://agent/agent-reviewer/reactor/review-pr',
      externalId: 'gitlab:merge-request-review:101:9001:abc:review-pr.v2',
      rootId: 'evt_input',
      parentId: 'evt_input',
      createdAt: '2026-05-17T10:37:22.108Z',
      data: { input_event_id: 'evt_input' },
    },
  ],
  agentRuns: [
    {
      id: 'run_review',
      inputEventId: 'evt_input',
      agentName: 'agent-reviewer',
      reactorName: 'review-pr',
      status: 'succeeded',
      createdAt: '2026-05-17T10:37:20.341Z',
      updatedAt: '2026-05-17T10:37:22.105Z',
    },
  ],
};

const dialogueRecord: DevOnceRunRecord = {
  version: 1,
  recordedAt: '2026-05-17T12:56:44.263Z',
  scenarioId: 'example/dialogue',
  inputEventId: 'evt_question',
  rootId: 'evt_question',
  events: [
    {
      id: 'evt_question',
      type: 'chat.question.v1',
      source: 'synapse://example/agent-dialogue/ingress',
      externalId: 'chat-question:subj-1',
      subject: 'subj-1',
      rootId: 'evt_question',
      createdAt: '2026-05-17T12:56:40.000Z',
      data: { text: 'How do multiple agents share one event trace?' },
    },
    {
      id: 'evt_answer',
      type: 'chat.answer.v1',
      source: 'agent://example-agent-dialogue-responder/answer-question',
      externalId: 'chat-answer:evt_question',
      subject: 'subj-1',
      rootId: 'evt_question',
      parentId: 'evt_question',
      createdAt: '2026-05-17T12:56:42.000Z',
      data: {
        reply: 'noted',
        question_event_id: 'evt_question',
      },
    },
    {
      id: 'evt_closed',
      type: 'chat.closed.v1',
      source: 'agent://example-agent-dialogue-questioner/close-dialogue',
      externalId: 'chat-closed:evt_answer',
      subject: 'subj-1',
      rootId: 'evt_question',
      parentId: 'evt_answer',
      createdAt: '2026-05-17T12:56:44.000Z',
      data: {
        summary: 'done',
        answer_event_id: 'evt_answer',
        question_event_id: 'evt_question',
      },
    },
  ],
  agentRuns: [
    {
      id: 'run_responder',
      inputEventId: 'evt_question',
      agentName: 'example-agent-dialogue-responder',
      reactorName: 'answer-question',
      status: 'succeeded',
      createdAt: '2026-05-17T12:56:41.000Z',
      updatedAt: '2026-05-17T12:56:42.000Z',
    },
    {
      id: 'run_questioner',
      inputEventId: 'evt_answer',
      agentName: 'example-agent-dialogue-questioner',
      reactorName: 'close-dialogue',
      status: 'succeeded',
      createdAt: '2026-05-17T12:56:43.000Z',
      updatedAt: '2026-05-17T12:56:44.000Z',
    },
  ],
};

describe('formatRunRecordFlow', () => {
  it('renders ingress, reactor, and emitted outcome in order', () => {
    const output = formatRunRecordFlow(reviewPrRecord);
    const inputIndex = output.indexOf('pr.received.v1');
    const runIndex = output.indexOf('agent-reviewer / review-pr');
    const reviewIndex = output.indexOf('pr.reviewed.v1');
    expect(inputIndex).toBeGreaterThan(-1);
    expect(runIndex).toBeGreaterThan(inputIndex);
    expect(reviewIndex).toBeGreaterThan(runIndex);
  });

  it('renders multi-hop chains (question → answer → closed)', () => {
    const output = formatRunRecordFlow(dialogueRecord);
    const questionIndex = output.indexOf('chat.question.v1');
    const responderIndex = output.indexOf(
      'example-agent-dialogue-responder / answer-question',
    );
    const answerIndex = output.indexOf('chat.answer.v1');
    const questionerIndex = output.indexOf(
      'example-agent-dialogue-questioner / close-dialogue',
    );
    const closedIndex = output.indexOf('chat.closed.v1');
    expect(questionIndex).toBeGreaterThan(-1);
    expect(responderIndex).toBeGreaterThan(questionIndex);
    expect(answerIndex).toBeGreaterThan(responderIndex);
    expect(questionerIndex).toBeGreaterThan(answerIndex);
    expect(closedIndex).toBeGreaterThan(questionerIndex);
  });

  it('notes when a succeeded run produced no downstream events', () => {
    const output = formatRunRecordFlow({
      ...reviewPrRecord,
      events: reviewPrRecord.events.filter(
        (event) => event.type === 'pr.received.v1',
      ),
    });
    expect(output).toContain('no downstream events recorded');
  });

  it('orders pi tool-call siblings by timeline_order when createdAt ties', () => {
    const output = formatRunRecordFlow({
      ...reviewPrRecord,
      events: [
        reviewPrRecord.events[0]!,
        {
          id: 'evt_pi_complete',
          type: 'pi.tool-call.completed.v1',
          source: 'agent://agent-reviewer/review-pr',
          externalId: 'pi:tool:tc-1:completed',
          rootId: 'evt_input',
          parentId: 'evt_input',
          createdAt: '2026-05-17T10:37:20.500Z',
          data: {
            tool_call_id: 'tc-1',
            tool_name: 'read',
            is_error: false,
            input_event_id: 'evt_input',
            review_subject: 'gitlab:group/project!1',
            timeline_order: 1,
          },
        },
        {
          id: 'evt_pi_start',
          type: 'pi.tool-call.started.v1',
          source: 'agent://agent-reviewer/review-pr',
          externalId: 'pi:tool:tc-1:started',
          rootId: 'evt_input',
          parentId: 'evt_input',
          createdAt: '2026-05-17T10:37:20.500Z',
          data: {
            tool_call_id: 'tc-1',
            tool_name: 'read',
            args: { summary: 'read README.md' },
            input_event_id: 'evt_input',
            review_subject: 'gitlab:group/project!1',
            timeline_order: 0,
          },
        },
        reviewPrRecord.events[1]!,
      ],
    });
    const startedIndex = output.indexOf('pi.tool-call.started.v1');
    const completedIndex = output.indexOf('pi.tool-call.completed.v1');
    expect(startedIndex).toBeGreaterThan(-1);
    expect(completedIndex).toBeGreaterThan(-1);
    expect(startedIndex).toBeLessThan(completedIndex);
  });

  it('prints last_error under a failed agent run', () => {
    const ansi = /\u001b\[[0-9;]*m/g;
    const output = formatRunRecordFlow({
      ...reviewPrRecord,
      events: reviewPrRecord.events.filter(
        (event) => event.type === 'pr.received.v1',
      ),
      agentRuns: [
        {
          ...reviewPrRecord.agentRuns[0]!,
          status: 'failed',
          lastError: 'Pi review exited with code 2\nstderr: oops',
        },
      ],
    });
    const plain = output.replace(ansi, '');
    expect(plain).toContain('last_error:');
    expect(plain).toContain('Pi review exited with code 2');
    expect(plain).toContain('stderr: oops');
  });
});
