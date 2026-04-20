import type { SynapseEvent } from 'runtime-agent';
import { type EventDataFor, REVIEWER_AGENT } from 'runtime-events';
import {
  defineIngress,
  type Ingress,
  type IngressContext,
} from 'runtime-worker';

import {
  type GitLabMergeRequestWebhook,
  gitlabMergeRequestWebhookSchema,
} from './gitlab-webhook';

export const REVIEW_PR_INGRESS_SOURCE =
  'synapse://webhooks/gitlab/prs' as const;

export type ReviewPrIngressInput = {
  payload: GitLabMergeRequestWebhook;
  receivedAt?: string;
};

export function normalizeGitLabMergeRequestWebhook(
  payload: GitLabMergeRequestWebhook,
): EventDataFor<'pr.received.v1'> {
  const parsed = gitlabMergeRequestWebhookSchema.parse(payload);
  const attrs = parsed.object_attributes;
  return {
    provider: 'gitlab',
    project: {
      id: parsed.project.id,
      name: parsed.project.name,
      path_with_namespace: parsed.project.path_with_namespace,
      web_url: parsed.project.web_url,
      git_http_url: parsed.project.git_http_url,
      git_ssh_url: parsed.project.git_ssh_url,
      default_branch: parsed.project.default_branch,
    },
    merge_request: {
      id: attrs.id,
      iid: attrs.iid,
      title: attrs.title,
      description: attrs.description,
      url: attrs.url,
      action: attrs.action,
      actioned_at: attrs.actioned_at,
      state: attrs.state,
      draft: attrs.draft,
      source_branch: attrs.source_branch,
      target_branch: attrs.target_branch,
      source_project_id: attrs.source_project_id,
      target_project_id: attrs.target_project_id,
      last_commit_sha: attrs.last_commit.id,
      ...(attrs.oldrev === undefined ? {} : { oldrev: attrs.oldrev }),
    },
    author: {
      id: parsed.user.id,
      username: parsed.user.username,
      name: parsed.user.name,
    },
    labels: parsed.labels.map((label) => label.title),
    reviewers: parsed.reviewers.map((reviewer) => ({
      id: reviewer.id,
      username: reviewer.username,
      name: reviewer.name,
    })),
    changes: parsed.changes,
    raw_webhook: {
      object_kind: parsed.object_kind,
      event_type: parsed.event_type,
      project_id: parsed.project.id,
      merge_request_id: attrs.id,
      merge_request_iid: attrs.iid,
      action: attrs.action,
      actioned_at: attrs.actioned_at,
    },
  };
}

export function reviewPrSubject(payload: GitLabMergeRequestWebhook): string {
  const parsed = gitlabMergeRequestWebhookSchema.parse(payload);
  return `gitlab:${parsed.project.path_with_namespace}!${parsed.object_attributes.iid}`;
}

export function reviewPrExternalId(payload: GitLabMergeRequestWebhook): string {
  const parsed = gitlabMergeRequestWebhookSchema.parse(payload);
  const attrs = parsed.object_attributes;
  return `gitlab:merge-request:${parsed.project.id}:${attrs.id}:${attrs.action}:${attrs.actioned_at}`;
}

export async function emitReviewPrReceived(
  ctx: IngressContext<Record<string, never>, Record<string, never>>,
  input: ReviewPrIngressInput,
): Promise<SynapseEvent<EventDataFor<'pr.received.v1'>>> {
  const normalized = normalizeGitLabMergeRequestWebhook(input.payload);
  const subject = reviewPrSubject(input.payload);
  const externalId = reviewPrExternalId(input.payload);
  return (await ctx.emit('pr.received.v1', normalized, {
    source: REVIEW_PR_INGRESS_SOURCE,
    subject,
    externalId,
  })) as SynapseEvent<EventDataFor<'pr.received.v1'>>;
}

export const triggerReviewPrIngress: Ingress<
  Record<string, never>,
  Record<string, never>,
  ReviewPrIngressInput
> = defineIngress(async (ctx, input) => {
  await emitReviewPrReceived(ctx, input);
});

export const reviewerIngressAgent = REVIEWER_AGENT;
