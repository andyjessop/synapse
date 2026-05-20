export type SynapseEvent<TData = unknown> = {
  id: string;
  type: string;
  source: string;
  externalId: string;
  subject?: string;
  data: TData;
  rootId: string;
  parentId?: string;
  traceparent?: string;
  tracestate?: string;
  createdAt: string;
};
