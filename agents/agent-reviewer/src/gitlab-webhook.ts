import { z } from 'zod';

export const gitlabMergeRequestActionSchema = z.enum([
  'open',
  'close',
  'reopen',
  'update',
  'approval',
  'approved',
  'unapproval',
  'unapproved',
  'merge',
]);

export const gitlabUserSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    username: z.string().min(1),
    avatar_url: z.string().nullable().optional(),
    email: z.string().optional(),
  })
  .passthrough();

export const gitlabProjectSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    web_url: z.string().url(),
    avatar_url: z.string().nullable().optional(),
    git_ssh_url: z.string().min(1),
    git_http_url: z.string().url(),
    namespace: z.string().min(1),
    visibility_level: z.number().int(),
    path_with_namespace: z.string().min(1),
    default_branch: z.string().min(1),
    ci_config_path: z.string().nullable().optional(),
  })
  .passthrough();

export const gitlabLabelSchema = z
  .object({
    id: z.number().int().positive(),
    title: z.string().min(1),
    color: z.string().min(1).optional(),
  })
  .passthrough();

export const gitlabMergeRequestWebhookSchema = z
  .object({
    object_kind: z.literal('merge_request'),
    event_type: z.literal('merge_request'),
    user: gitlabUserSchema,
    project: gitlabProjectSchema,
    object_attributes: z
      .object({
        author_id: z.number().int().positive(),
        created_at: z.string().min(1),
        description: z.string(),
        draft: z.boolean(),
        id: z.number().int().positive(),
        iid: z.number().int().positive(),
        source_branch: z.string().min(1),
        source_project_id: z.number().int().positive(),
        state: z.enum(['opened', 'closed', 'merged', 'locked']),
        target_branch: z.string().min(1),
        target_project_id: z.number().int().positive(),
        title: z.string().min(1),
        updated_at: z.string().min(1),
        url: z.string().url(),
        action: gitlabMergeRequestActionSchema,
        actioned_at: z.string().min(1),
        last_commit: z
          .object({
            id: z.string().min(7),
            message: z.string(),
            title: z.string(),
            timestamp: z.string().min(1),
            url: z.string().url(),
            author: z
              .object({
                name: z.string().min(1),
                email: z.string().min(1),
              })
              .passthrough(),
          })
          .passthrough(),
        oldrev: z.string().min(7).optional(),
      })
      .passthrough(),
    labels: z.array(gitlabLabelSchema).default([]),
    reviewers: z.array(gitlabUserSchema).default([]),
    assignees: z.array(gitlabUserSchema).default([]),
    changes: z
      .record(
        z.string(),
        z
          .object({
            previous: z.unknown(),
            current: z.unknown(),
          })
          .strict(),
      )
      .default({}),
  })
  .passthrough();

export type GitLabMergeRequestWebhook = z.infer<
  typeof gitlabMergeRequestWebhookSchema
>;
