import { gitlabAdapter } from 'adapter-gitlab/definition';

export const shippedAdapters = [gitlabAdapter] as const;

export type ShippedAdapterSourceDefinition = (typeof shippedAdapters)[number];
