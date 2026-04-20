/**
 * Adjust webhook fields that feed ingress `externalId` so each `dev:once` POST
 * creates a new `pr.received.v1` (see `reviewPrExternalId` in agent-reviewer).
 */
export function uniquifyGitLabMergeRequestWebhookBody(body: Buffer): Buffer {
  const parsed = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
  const objectAttributes = parsed.object_attributes as
    | Record<string, unknown>
    | undefined;
  if (objectAttributes !== undefined) {
    objectAttributes.actioned_at = new Date().toISOString();
    const lastCommit = objectAttributes.last_commit as
      | Record<string, unknown>
      | undefined;
    if (lastCommit !== undefined) {
      lastCommit.id = `dev-once-${Date.now()}`;
    }
  }
  return Buffer.from(JSON.stringify(parsed), 'utf8');
}
