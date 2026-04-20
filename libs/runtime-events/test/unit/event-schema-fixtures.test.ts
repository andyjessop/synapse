import { describe, expect, it } from 'vitest';
import type { EventType } from '../../src/index';
import { validateEventData } from '../../src/index';

const validByType: Record<EventType, unknown> = {
  'example.ping.v1': { message: 'hello' },
  'example.pong.v1': { echo: 'hello', ping_event_id: 'evt-ping' },
  'runtime.fixture.signal.v1': {
    fixture_id: 'fixture-1',
    emitted_at: '2026-05-14T08:00:00.000Z',
    sequence: 0,
  },
  'custom.unknown.v1': { payload: 'unknown' },
  'example.unsubscribed.v1': { payload: 'unsubscribed' },
  'example.toggle-fail.v1': { payload: 'toggle' },
  'example.toggle-ok.v1': { payload: 'toggle-ok' },
  'example.legacy-fail.v1': { payload: 'legacy' },
  'example.legacy-ok.v1': { payload: 'legacy-ok' },
  'example.fail.v1': { payload: 'fail' },
  'example.throw-after.v1': { payload: 'throw-after' },
  'example.emitted.v1': { payload: 'emitted' },
  'example.hang.v1': { payload: 'hang' },
  'example.double.v1': { payload: 'double' },
  'example.nosubject.v1': { payload: 'nosubject' },
  'example.slow.v1': { payload: 'slow' },
  'example.slow.done.v1': { payload: 'slow-done' },
  'example.fast.v1': { payload: 'fast' },
  'example.fast.done.v1': { payload: 'fast-done' },
  'example.parent.v1': { payload: 'parent' },
  'example.child.v1': { payload: 'child' },
  'example.bad.v1': { payload: 'bad' },
  'example.emit-only.v1': { payload: 'emit-only' },
  'example.dead-end.v1': { payload: 'dead-end' },
  'example.loop.v1': { payload: 'loop' },
  'example.fail-run.v1': { payload: 'fail-run' },
  'example.sqlite.count.requested.v1': { ping_token: 'tok-1' },
  'example.sqlite.count.updated.v1': {
    ping_token: 'tok-1',
    count_after: 1,
    input_event_id: 'evt-in-1',
  },
  'example.sqlite.note.append.v1': { subject: 'notes', body: 'hello' },
  'example.sqlite.note.stored.v1': {
    note_id: 'note-1',
    subject: 'notes',
    char_count: 5,
    input_event_id: 'evt-note-1',
  },
  'pi.tool-call.started.v1': {
    tool_call_id: 'tc-1',
    tool_name: 'read',
    args: { summary: 'read README.md' },
    input_event_id: 'evt-in-1',
    review_subject: 'gitlab:group/project!1',
    timeline_order: 0,
  },
  'pi.tool-call.completed.v1': {
    tool_call_id: 'tc-1',
    tool_name: 'read',
    is_error: false,
    input_event_id: 'evt-in-1',
    review_subject: 'gitlab:group/project!1',
    timeline_order: 1,
  },
  'pr.received.v1': {
    provider: 'gitlab',
    project: {
      id: 1,
      name: 'project',
      path_with_namespace: 'group/project',
      web_url: 'https://gitlab.example/group/project',
      git_http_url: 'https://gitlab.example/group/project.git',
      git_ssh_url: 'git@gitlab.example:group/project.git',
      default_branch: 'main',
    },
    merge_request: {
      id: 1,
      iid: 2,
      title: 'MR',
      description: 'Body',
      url: 'https://gitlab.example/group/project/-/merge_requests/2',
      action: 'open',
      actioned_at: '2026-05-14T08:00:00.000Z',
      state: 'opened',
      draft: false,
      source_branch: 'feature',
      target_branch: 'main',
      source_project_id: 1,
      target_project_id: 1,
      last_commit_sha: 'abcdef1',
    },
    author: { id: 1, username: 'octo', name: 'Octo' },
    labels: [],
    reviewers: [],
    changes: {},
    raw_webhook: { object_kind: 'merge_request', event_type: 'merge_request' },
  },
  'pr.reviewed.v1': {
    provider: 'gitlab',
    project_path: 'group/project',
    merge_request_iid: 2,
    merge_request_url:
      'https://gitlab.example/group/project/-/merge_requests/2',
    input_event_id: 'evt-in-1',
    review: { markdown: 'Looks good', summary: 'ok', finding_count: 0 },
    reviewer: {
      agent: 'agent-reviewer',
      reactor: 'review-pr',
      prompt_version: 'review-pr.v2',
      engine: 'pi',
    },
    pi: {
      command: 'pi run',
      cwd: '/repo',
      exit_code: 0,
      duration_ms: 1,
      stdout_bytes: 2,
      stderr_bytes: 0,
    },
  },
  'pipeline.raw.v1': { payload: 'a\nb' },
  'pipeline.parsed.v1': { lines: ['a', 'b'], input_event_id: 'evt-1' },
  'pipeline.done.v1': { line_count: 2, input_event_id: 'evt-2' },
  'notify.broadcast.v1': { message: 'hello' },
  'notify.email.v1': {
    channel: 'email',
    body: 'hello',
    input_event_id: 'evt-1',
  },
  'notify.slack.v1': {
    channel: 'slack',
    body: 'hello',
    input_event_id: 'evt-1',
  },
  'ticket.opened.v1': { ticket_id: 'T-1', title: 'Ticket', body: 'Body' },
  'ticket.notified.v1': {
    ticket_id: 'T-1',
    comment_markdown: 'Done',
    input_event_id: 'evt-ticket',
  },
  'chat.question.v1': { text: 'Question?' },
  'chat.answer.v1': { reply: 'Answer', question_event_id: 'evt-question' },
  'chat.closed.v1': {
    question_event_id: 'evt-question',
    answer_event_id: 'evt-answer',
    summary: 'closed',
  },
};

describe('event schema fixtures', () => {
  it('accepts one valid fixture for every registered event type', () => {
    for (const [type, fixture] of Object.entries(validByType) as [
      EventType,
      unknown,
    ][]) {
      expect(() => validateEventData(type, fixture)).not.toThrow();
    }
  });

  it('rejects invalid payloads', () => {
    expect(() => validateEventData('ticket.opened.v1', {})).toThrow();
  });
});
