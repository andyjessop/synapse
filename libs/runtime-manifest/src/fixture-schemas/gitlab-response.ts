import { z } from 'zod';

/** Response shape for `gitlab.fetchChanges.v1.schema.json` adapter fixtures (authoritative here). */
export const gitlabFetchChangesResponseSchema = z
  .object({
    project_id: z.number().int().positive(),
    merge_request_iid: z.number().int().positive(),
    merge_request_id: z.number().int().positive().optional(),
    changes: z.array(
      z
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
        .strict(),
    ),
  })
  .strict();
