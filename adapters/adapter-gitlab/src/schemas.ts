import { z } from 'zod';

export const gitlabFetchChangesParamsSchema = z
  .object({
    projectId: z.number().int().positive(),
    mergeRequestIid: z.number().int().positive(),
    mergeRequestId: z.number().int().positive().optional(),
  })
  .strict();

export type GitlabFetchChangesParams = z.infer<
  typeof gitlabFetchChangesParamsSchema
>;

export const gitLabMrChangeFileSchema = z
  .object({
    old_path: z.string(),
    new_path: z.string(),
    a_mode: z.string().optional(),
    b_mode: z.string().optional(),
    diff: z.string(),
    new_file: z.boolean().optional(),
    renamed_file: z.boolean().optional(),
    deleted_file: z.boolean().optional(),
  })
  .strict();

export const gitLabMrChangesSchema = z
  .object({
    project_id: z.number().int().positive(),
    merge_request_iid: z.number().int().positive(),
    merge_request_id: z.number().int().positive().optional(),
    changes: z.array(gitLabMrChangeFileSchema),
  })
  .strict();

export type GitLabMrChanges = z.infer<typeof gitLabMrChangesSchema>;

export type GitlabFetchChangesResult = GitLabMrChanges;
