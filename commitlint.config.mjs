// Conventional Commits (BASE-16, docs/VERSIONING.md §4), checked by the
// commit-msg hook (.husky/commit-msg) and by the `commits` CI job on every PR.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Subjects often start with a backlog ID or an acronym ("SYNC-04 …",
    // "HLC …", "PDF …"); Conventional Commits does not mandate a case.
    "subject-case": [0],
  },
};
