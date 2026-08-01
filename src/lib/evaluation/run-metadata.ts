export function formatEvaluationGitCommit(head: string, porcelainStatus: string): string {
  const commit = head.trim();
  if (!commit) throw new Error("git HEAD is required for evaluation metadata");
  return porcelainStatus.trim() ? `${commit}-dirty` : commit;
}
