import { z } from 'zod';

export const devOnceRunRecordEventSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    source: z.string().min(1),
    externalId: z.string().min(1),
    subject: z.string().optional(),
    rootId: z.string().min(1),
    parentId: z.string().optional(),
    createdAt: z.string().min(1),
    /** Event payload (`events.data` / CloudEvents `data`). */
    data: z.unknown(),
  })
  .strict();

export const devOnceRunRecordAgentRunSchema = z
  .object({
    id: z.string().min(1),
    inputEventId: z.string().min(1),
    agentName: z.string().min(1),
    reactorName: z.string().min(1),
    status: z.string().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    lastError: z.string().optional(),
  })
  .strict();

export const devOnceRunRecordSchema = z
  .object({
    version: z.literal(1),
    recordedAt: z.string().min(1),
    scenarioId: z.string().min(1),
    inputEventId: z.string().min(1),
    rootId: z.string().min(1),
    events: z.array(devOnceRunRecordEventSchema),
    agentRuns: z.array(devOnceRunRecordAgentRunSchema),
  })
  .strict();

export type DevOnceRunRecordEvent = z.infer<typeof devOnceRunRecordEventSchema>;
export type DevOnceRunRecordAgentRun = z.infer<
  typeof devOnceRunRecordAgentRunSchema
>;
export type DevOnceRunRecord = z.infer<typeof devOnceRunRecordSchema>;
