import {
  devOnceRunRecordAgentRunSchema,
  devOnceRunRecordEventSchema,
} from 'dev-cli-shared';
import { z } from 'zod';

export const synapseRunArtifactSchema = z
  .object({
    version: z.literal(1),
    status: z.enum(['succeeded', 'failed', 'timed_out']),
    manifest: z
      .object({
        name: z.string().min(1),
        path: z.string().min(1),
      })
      .strict(),
    fixture: z
      .object({
        id: z.string().min(1),
        path: z.string().min(1),
        title: z.string().min(1),
        agent: z.string().min(1),
      })
      .strict(),
    rootEvent: devOnceRunRecordEventSchema.optional(),
    events: z.array(devOnceRunRecordEventSchema),
    agentRuns: z.array(devOnceRunRecordAgentRunSchema),
    observability: z
      .object({
        jaegerTraceUrl: z.string().url().optional(),
        traceId: z.string().optional(),
      })
      .strict()
      .optional(),
    files: z
      .object({
        artifactPath: z.string().min(1).optional(),
        graphSnapshotPath: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SynapseRunArtifact = z.infer<typeof synapseRunArtifactSchema>;
