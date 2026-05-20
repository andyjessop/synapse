/** Agent is not mounted on this worker's manifest (another worker may own it). */
export function shouldDeferRunToOtherWorker(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /^Missing agent registration: [^/]+(?: \(manifest [^)]+\))?$/.test(
    error.message,
  );
}
