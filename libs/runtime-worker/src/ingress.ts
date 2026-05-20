import type { Tracer } from '@opentelemetry/api';
import { context } from '@opentelemetry/api';
import type { SynapseEvent } from 'runtime-agent';
import { eventTraceCarrier, runWithRuntimeSpan } from 'runtime-observability';
import { appendEvent, type RuntimePool } from 'runtime-store';

export type EmitEventOptions = {
  source?: string;
  subject?: string;
  externalId: string;
  rootId?: string;
  parentId?: string;
};

export type IngressEmit = (
  type: string,
  data: unknown,
  options: EmitEventOptions,
) => Promise<SynapseEvent>;

export type IngressContext<
  TAdapters extends Record<string, unknown> = Record<string, never>,
  TAgents extends Record<string, unknown> = Record<string, never>,
> = {
  agent: string;
  source: string;
  emit: IngressEmit;
  store: { pool: RuntimePool };
  adapters: TAdapters;
  agents: TAgents;
};

export type Ingress<
  TAdapters extends Record<string, unknown> = Record<string, never>,
  TAgents extends Record<string, unknown> = Record<string, never>,
  TInput = undefined,
> = undefined extends TInput
  ? (
      ctx: IngressContext<TAdapters, TAgents>,
      input?: TInput,
    ) => void | Promise<void>
  : (
      ctx: IngressContext<TAdapters, TAgents>,
      input: TInput,
    ) => void | Promise<void>;

export type CreateIngressContextOptions<
  TAdapters extends Record<string, unknown> = Record<string, never>,
  TAgents extends Record<string, unknown> = Record<string, never>,
> = {
  agent: string;
  source: string;
  store: RuntimePool;
  adapters?: TAdapters;
  agents?: TAgents;
  tracer?: Tracer;
};

export function defineIngress<
  TAdapters extends Record<string, unknown> = Record<string, never>,
  TAgents extends Record<string, unknown> = Record<string, never>,
  TInput = undefined,
>(
  ingress: Ingress<TAdapters, TAgents, TInput>,
): Ingress<TAdapters, TAgents, TInput> {
  return ingress;
}

export type PollTickReasonCounts = Record<string, number>;

export type PollIngressInput<TParams, TCandidate = unknown> = {
  params: TParams;
  polledAt: string;
  /** When set (scenario or inject), agent uses these candidates instead of live discovery. */
  candidates?: TCandidate[];
};

/**
 * Poll ingress tick result. `rootEventIds` lists one durable event id per successful
 * root semantic emit from this tick (new or deduped existing events returned by `ctx.emit`).
 */
export type PollIngressResult = {
  emitted: number;
  skipped: number;
  failed: number;
  rootEventIds: string[];
  skipReasons?: PollTickReasonCounts;
  failureReasons?: PollTickReasonCounts;
};

export type PollIngress<
  TAdapters extends Record<string, unknown> = Record<string, never>,
  TAgents extends Record<string, unknown> = Record<string, never>,
  TInput = undefined,
> = (
  ctx: IngressContext<TAdapters, TAgents>,
  input: TInput,
) => PollIngressResult | Promise<PollIngressResult>;

export function definePollIngress<
  TAdapters extends Record<string, unknown> = Record<string, never>,
  TAgents extends Record<string, unknown> = Record<string, never>,
  TInput = undefined,
>(
  ingress: PollIngress<TAdapters, TAgents, TInput>,
): PollIngress<TAdapters, TAgents, TInput> {
  return ingress;
}

export function createIngressContext<
  TAdapters extends Record<string, unknown> = Record<string, never>,
  TAgents extends Record<string, unknown> = Record<string, never>,
>(
  options: CreateIngressContextOptions<TAdapters, TAgents>,
): IngressContext<TAdapters, TAgents> {
  if (options.agent.trim() === '') {
    throw new Error('Ingress agent must be non-empty');
  }
  if (options.source.trim() === '') {
    throw new Error('Ingress source must be non-empty');
  }

  return {
    agent: options.agent,
    source: options.source,
    store: { pool: options.store },
    adapters: options.adapters ?? ({} as TAdapters),
    agents: options.agents ?? ({} as TAgents),
    emit: (type, data, emitOptions) => {
      const appendFromContext = (activeContext = context.active()) =>
        appendEvent(options.store, {
          type,
          data,
          source: emitOptions.source ?? options.source,
          externalId: emitOptions.externalId,
          subject: emitOptions.subject,
          rootId: emitOptions.rootId,
          parentId: emitOptions.parentId,
          ...eventTraceCarrier(activeContext),
        });
      if (options.tracer === undefined) {
        return appendFromContext();
      }
      return runWithRuntimeSpan({
        hop: 'ingress.emit',
        tracer: options.tracer,
        eventType: type,
        source: emitOptions.source ?? options.source,
        agent: options.agent,
        run: (_span, spanContext) => appendFromContext(spanContext),
      });
    },
  };
}
