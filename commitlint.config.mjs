// Conventional Commits (BASE-16, docs/VERSIONING.md §4), checked by the
// commit-msg hook (.husky/commit-msg) and by the `commits` CI job on every PR.

/** Integration merges ("Merge track A1: …", "Merge branch 'main' into …") are
 *  exempt: Conventional Commits applies to work commits. commitlint's default
 *  ignores only cover git's own "Merge branch …"/"Merge pull request …" forms. */
export const isMergeCommit = (message) => /^Merge\b/.test(message);

export default {
  extends: ["@commitlint/config-conventional"],
  defaultIgnores: true,
  ignores: [isMergeCommit],
  rules: {
    // Subjects often start with a backlog ID or an acronym ("SYNC-04 …",
    // "HLC …", "PDF …"); Conventional Commits does not mandate a case.
    "subject-case": [0],
  },
};
