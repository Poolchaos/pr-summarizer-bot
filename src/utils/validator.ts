/**
 * Validate if PR diff size is within acceptable limits
 */
export function isValidDiffSize(additions: number, deletions: number, maxDiffSize: number): boolean {
  const totalChanges = additions + deletions;
  return totalChanges > 0 && totalChanges <= maxDiffSize;
}

/**
 * Validate if PR has meaningful content
 */
export function hasMeaningfulContent(
  diff: string,
  commits: Array<{ message: string }>,
  description?: string
): boolean {
  // Check diff has actual content
  if (!diff || diff.length < 50) {
    return false;
  }

  // Check commits exist and have messages
  if (!commits || commits.length === 0) {
    return false;
  }

  const hasCommitMessages = commits.some((c) => c.message && c.message.trim().length > 10);

  // Need either commit messages or description
  if (!hasCommitMessages && (!description || description.trim().length < 20)) {
    return false;
  }

  return true;
}

/**
 * Validate label is in ignore list
 */
export function shouldIgnoreByLabel(prLabels: string[], ignoreLabels: string[]): boolean {
  if (!prLabels || prLabels.length === 0 || !ignoreLabels || ignoreLabels.length === 0) {
    return false;
  }

  return prLabels.some((label) => ignoreLabels.includes(label));
}

/**
 * Sanitize user-provided text to prevent injection attacks
 */
export function sanitizeInput(input: string): string {
  if (!input) {
    return '';
  }

  // Remove control characters and trim
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x1F\x7F]/g, '').trim();
}
