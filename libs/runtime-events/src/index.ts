import { z } from 'zod';

export const EVENT_TYPE_SEGMENT_PATTERN = /^[a-z0-9-]+$/;
export const EVENT_TYPE_VERSION_PATTERN = /^v[1-9][0-9]*$/;

const eventTypePattern = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.v[1-9][0-9]*$/;
const topicPattern = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*\/v[1-9][0-9]*$/;

export const agentNameSchema = z.string().min(1);

export type AgentName = z.infer<typeof agentNameSchema>;

/** Platform/infrastructure events are owned by `runtime`, not by a capability agent. */

export const eventOwnerNameSchema = z.string().min(1);

export type EventOwnerName = z.infer<typeof eventOwnerNameSchema>;

export type EventCategory = 'signal' | 'intent' | 'outcome' | 'lifecycle';

export type EventDefinition<TData> = {
  category: EventCategory;
  owner: EventOwnerName;
  schema: z.ZodType<TData>;
  emitByProxy?: readonly AgentName[];
};

export const isoDateTimeSchema = z.string().refine((value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}, 'Expected canonical ISO-8601 UTC timestamp with milliseconds (e.g. 2026-01-01T12:00:00.000Z)');

/** Merge request review capability agent. */
export const REVIEWER_AGENT = 'agent-reviewer' as const;

/** Example curriculum agents (`examples/agents/*`). */
export const EXAMPLE_AGENT_PIPELINE = 'example-agent-pipeline' as const;
export const EXAMPLE_AGENT_SPLITTER = 'example-agent-splitter' as const;
export const EXAMPLE_AGENT_NOTIFIER = 'example-agent-notifier' as const;
export const EXAMPLE_AGENT_DIALOGUE_QUESTIONER =
  'example-agent-dialogue-questioner' as const;
export const EXAMPLE_AGENT_DIALOGUE_RESPONDER =
  'example-agent-dialogue-responder' as const;

export const EXAMPLE_AGENT_SQLITE_COUNTER = 'example-sqlite-counter' as const;
export const EXAMPLE_AGENT_SQLITE_NOTEBOOK = 'example-sqlite-notebook' as const;

/** Bounded tool args for Pi harness observability (no file contents). */
export const piToolCallArgsSchema = z.record(z.string(), z.unknown());

export const piToolCallStartedSchema = z
  .object({
    tool_call_id: z.string().min(1),
    tool_name: z.string().min(1),
    args: piToolCallArgsSchema,
    input_event_id: z.string().min(1),
    review_subject: z.string().min(1),
    /** Monotonic per review run; defines causal order when `createdAt` ties. */
    timeline_order: z.number().int().nonnegative(),
  })
  .strict();

export const piToolCallCompletedSchema = z
  .object({
    tool_call_id: z.string().min(1),
    tool_name: z.string().min(1),
    is_error: z.boolean(),
    args: piToolCallArgsSchema,
    result_summary: z.string().min(1).max(512).optional(),
    input_event_id: z.string().min(1),
    review_subject: z.string().min(1),
    timeline_order: z.number().int().nonnegative(),
  })
  .strict();

export const prReceivedSchema = z
  .object({
    provider: z.literal('gitlab'),
    project: z
      .object({
        id: z.number().int().positive(),
        name: z.string().min(1),
        path_with_namespace: z.string().min(1),
        web_url: z.string().url(),
        git_http_url: z.string().url(),
        git_ssh_url: z.string().min(1),
        default_branch: z.string().min(1),
      })
      .strict(),
    merge_request: z
      .object({
        id: z.number().int().positive(),
        iid: z.number().int().positive(),
        title: z.string().min(1),
        description: z.string(),
        url: z.string().url(),
        action: z.enum([
          'open',
          'close',
          'reopen',
          'update',
          'approval',
          'approved',
          'unapproval',
          'unapproved',
          'merge',
        ]),
        actioned_at: z.string().min(1),
        state: z.enum(['opened', 'closed', 'merged', 'locked']),
        draft: z.boolean(),
        source_branch: z.string().min(1),
        target_branch: z.string().min(1),
        source_project_id: z.number().int().positive(),
        target_project_id: z.number().int().positive(),
        last_commit_sha: z.string().min(7),
        oldrev: z.string().min(7).optional(),
      })
      .strict(),
    author: z
      .object({
        id: z.number().int().positive(),
        username: z.string().min(1),
        name: z.string().min(1),
      })
      .strict(),
    labels: z.array(z.string().min(1)),
    reviewers: z.array(
      z
        .object({
          id: z.number().int().positive(),
          username: z.string().min(1),
          name: z.string().min(1),
          state: z.string().min(1).optional(),
        })
        .strict(),
    ),
    changes: z.record(
      z.string(),
      z
        .object({
          previous: z.unknown(),
          current: z.unknown(),
        })
        .strict(),
    ),
    raw_webhook: z
      .object({
        object_kind: z.literal('merge_request'),
        event_type: z.literal('merge_request'),
      })
      .passthrough(),
  })
  .strict();

export const prReviewedSchema = z
  .object({
    provider: z.literal('gitlab'),
    project_path: z.string().min(1),
    merge_request_iid: z.number().int().positive(),
    merge_request_url: z.string().url(),
    input_event_id: z.string().min(1),
    review: z
      .object({
        markdown: z.string().min(1),
        summary: z.string().min(1),
        finding_count: z.number().int().nonnegative(),
      })
      .strict(),
    reviewer: z
      .object({
        agent: z.literal('agent-reviewer'),
        reactor: z.literal('review-pr'),
        prompt_version: z.literal('review-pr.v2'),
        engine: z.literal('pi'),
      })
      .strict(),
    pi: z
      .object({
        command: z.string().min(1),
        cwd: z.string().min(1),
        exit_code: z.number().int(),
        duration_ms: z.number().int().nonnegative(),
        stdout_bytes: z.number().int().nonnegative(),
        stderr_bytes: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

const eventRegistryDefinition = {
  'example.ping.v1': {
    category: 'signal',
    owner: 'example-echo',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.pong.v1': {
    category: 'outcome',
    owner: 'example-echo',
    schema: z.record(z.string(), z.unknown()),
  },
  'runtime.fixture.signal.v1': {
    category: 'signal',
    owner: 'example-echo',
    schema: z
      .object({
        fixture_id: z.string().min(1),
        emitted_at: isoDateTimeSchema,
        sequence: z.number().int().nonnegative(),
        message: z.string().min(1).optional(),
      })
      .strict(),
  },
  'custom.unknown.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.unsubscribed.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.toggle-fail.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.legacy-fail.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.fail.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.toggle-ok.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.legacy-ok.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.throw-after.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.emitted.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.hang.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.double.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.nosubject.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.slow.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.fast.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.parent.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.child.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.bad.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.emit-only.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.dead-end.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.loop.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.fail-run.v1': {
    category: 'signal',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.slow.done.v1': {
    category: 'outcome',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.fast.done.v1': {
    category: 'outcome',
    owner: 'runtime-test',
    schema: z.record(z.string(), z.unknown()),
  },
  'example.sqlite.count.requested.v1': {
    category: 'signal',
    owner: EXAMPLE_AGENT_SQLITE_COUNTER,
    schema: z
      .object({
        ping_token: z.string().min(1),
      })
      .strict(),
  },
  'example.sqlite.count.updated.v1': {
    category: 'outcome',
    owner: EXAMPLE_AGENT_SQLITE_COUNTER,
    schema: z
      .object({
        ping_token: z.string().min(1),
        count_after: z.number().int().positive(),
        input_event_id: z.string().min(1),
      })
      .strict(),
  },
  'example.sqlite.note.append.v1': {
    category: 'signal',
    owner: EXAMPLE_AGENT_SQLITE_NOTEBOOK,
    schema: z
      .object({
        subject: z.string().min(1),
        body: z.string().min(1),
      })
      .strict(),
  },
  'example.sqlite.note.stored.v1': {
    category: 'outcome',
    owner: EXAMPLE_AGENT_SQLITE_NOTEBOOK,
    schema: z
      .object({
        note_id: z.string().min(1),
        subject: z.string().min(1),
        char_count: z.number().int().nonnegative(),
        input_event_id: z.string().min(1),
      })
      .strict(),
  },
  'pi.tool-call.started.v1': {
    category: 'signal',
    owner: REVIEWER_AGENT,
    schema: piToolCallStartedSchema,
  },
  'pi.tool-call.completed.v1': {
    category: 'signal',
    owner: REVIEWER_AGENT,
    schema: piToolCallCompletedSchema,
  },
  'pr.received.v1': {
    category: 'signal',
    owner: REVIEWER_AGENT,
    schema: prReceivedSchema,
  },
  'pr.reviewed.v1': {
    category: 'outcome',
    owner: REVIEWER_AGENT,
    schema: prReviewedSchema,
  },
  'pipeline.raw.v1': {
    category: 'signal',
    owner: EXAMPLE_AGENT_PIPELINE,
    schema: z
      .object({
        payload: z.string().min(1),
      })
      .strict(),
  },
  'pipeline.parsed.v1': {
    category: 'intent',
    owner: EXAMPLE_AGENT_PIPELINE,
    schema: z
      .object({
        lines: z.array(z.string()),
        input_event_id: z.string().min(1),
      })
      .strict(),
  },
  'pipeline.done.v1': {
    category: 'outcome',
    owner: EXAMPLE_AGENT_PIPELINE,
    schema: z
      .object({
        line_count: z.number().int().nonnegative(),
        input_event_id: z.string().min(1),
      })
      .strict(),
  },
  'notify.broadcast.v1': {
    category: 'signal',
    owner: EXAMPLE_AGENT_SPLITTER,
    schema: z
      .object({
        message: z.string().min(1),
      })
      .strict(),
  },
  'notify.email.v1': {
    category: 'outcome',
    owner: EXAMPLE_AGENT_SPLITTER,
    schema: z
      .object({
        channel: z.literal('email'),
        body: z.string().min(1),
        input_event_id: z.string().min(1),
      })
      .strict(),
  },
  'notify.slack.v1': {
    category: 'outcome',
    owner: EXAMPLE_AGENT_SPLITTER,
    schema: z
      .object({
        channel: z.literal('slack'),
        body: z.string().min(1),
        input_event_id: z.string().min(1),
      })
      .strict(),
  },
  'ticket.opened.v1': {
    category: 'signal',
    owner: EXAMPLE_AGENT_NOTIFIER,
    schema: z
      .object({
        ticket_id: z.string().min(1),
        title: z.string().min(1),
        body: z.string(),
      })
      .strict(),
  },
  'ticket.notified.v1': {
    category: 'outcome',
    owner: EXAMPLE_AGENT_NOTIFIER,
    schema: z
      .object({
        ticket_id: z.string().min(1),
        comment_markdown: z.string().min(1),
        input_event_id: z.string().min(1),
      })
      .strict(),
  },
  'chat.question.v1': {
    category: 'signal',
    owner: EXAMPLE_AGENT_DIALOGUE_QUESTIONER,
    schema: z
      .object({
        text: z.string().min(1),
      })
      .strict(),
  },
  'chat.answer.v1': {
    category: 'intent',
    owner: EXAMPLE_AGENT_DIALOGUE_RESPONDER,
    schema: z
      .object({
        reply: z.string().min(1),
        question_event_id: z.string().min(1),
      })
      .strict(),
  },
  'chat.closed.v1': {
    category: 'outcome',
    owner: EXAMPLE_AGENT_DIALOGUE_QUESTIONER,
    schema: z
      .object({
        question_event_id: z.string().min(1),
        answer_event_id: z.string().min(1),
        summary: z.string().min(1),
      })
      .strict(),
  },
} as const satisfies Record<string, EventDefinition<unknown>>;

function assertValidEventType(type: string): void {
  if (!eventTypePattern.test(type)) {
    throw new Error(`Invalid event type: ${type}`);
  }
}

export function defineEventRegistry<
  TRegistry extends Record<string, EventDefinition<unknown>>,
>(registry: TRegistry): TRegistry {
  for (const [type, definition] of Object.entries(registry)) {
    assertValidEventType(type);
    eventOwnerNameSchema.parse(definition.owner);
    if (
      definition.category !== 'intent' &&
      definition.emitByProxy !== undefined
    ) {
      throw new Error(
        `${type} cannot declare emitByProxy unless category is intent`,
      );
    }
    for (const proxyAgent of definition.emitByProxy ?? []) {
      agentNameSchema.parse(proxyAgent);
    }
  }
  return registry;
}

export const eventRegistry = defineEventRegistry(eventRegistryDefinition);

export type EventType = keyof typeof eventRegistry;
export type EventDataFor<TType extends EventType> = z.infer<
  (typeof eventRegistry)[TType]['schema']
>;
export type EventTypeByCategory<TCategory extends EventCategory> = {
  [TType in EventType]: (typeof eventRegistry)[TType]['category'] extends TCategory
    ? TType
    : never;
}[EventType];

export type SignalEventType = EventTypeByCategory<'signal'>;
export type IntentEventType = EventTypeByCategory<'intent'>;
export type OutcomeEventType = EventTypeByCategory<'outcome'>;
export type LifecycleEventType = EventTypeByCategory<'lifecycle'>;

export function eventTypeToTopic(type: EventType): string {
  assertValidEventType(type);
  return type.replaceAll('.', '/');
}

export function eventTypeFromTopic(topic: string): EventType {
  if (!topicPattern.test(topic)) {
    throw new Error(`Invalid event topic: ${topic}`);
  }
  const type = topic.replaceAll('/', '.');
  if (!isEventType(type)) {
    throw new Error(`Unknown event type for topic: ${topic}`);
  }
  return type;
}

export function isEventType(type: string): type is EventType {
  return Object.hasOwn(eventRegistry, type);
}

export function getEventCategory(type: EventType): EventCategory {
  return eventRegistry[type].category;
}

export function getEventOwner(type: EventType): EventOwnerName {
  return eventRegistry[type].owner;
}

export function validateEventData<TType extends EventType>(
  type: TType | string,
  data: unknown,
): EventDataFor<TType> {
  if (!isEventType(type)) {
    throw new Error(`Unknown event type: ${type}`);
  }
  return eventRegistry[type].schema.parse(data) as EventDataFor<TType>;
}
