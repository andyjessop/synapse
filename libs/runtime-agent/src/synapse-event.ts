export type SynapseEvent<TData = unknown> = {
  id: string;
  type: string;
  source: string;
  externalId: string;
  subject?: string;
  data: TData;
  rootId: string;
  parentId?: string;
  createdAt: string;
};
