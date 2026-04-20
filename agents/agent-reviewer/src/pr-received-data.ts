import { z } from 'zod';

export const prReceivedDataSchema = z
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

export type PrReceivedData = z.infer<typeof prReceivedDataSchema>;
