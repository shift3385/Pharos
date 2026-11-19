// «Conectar CI» (INT-04, ADR-0054 §5): the GitHub Actions step that uploads a
// project's reports with Pharos' own `pharos-report` action. A pure function,
// so the snippet is tested as text. It never carries a token: the token goes
// in a GitHub secret, `PHAROS_TOKEN`, and the server in a variable.

/** Reports the server reads today (ADR-0052 §2, ADR-0053). */
export const CI_FORMATS = ["junit", "sarif", "k6", "axe", "ctrf", "playwright_json", "cucumber_messages"] as const;
export type CiFormat = (typeof CI_FORMATS)[number];

/** The four of the 0.6.0 exit criterion, chosen by default. */
export const DEFAULT_CI_FORMATS: CiFormat[] = ["junit", "sarif", "k6", "axe"];

/** Where each tool usually writes its report: a starting point the user
 *  changes for their own paths. */
export const CI_PATHS: Record<CiFormat, string> = {
  junit: "test-results/*.xml",
  sarif: "reports/*.sarif",
  k6: "reports/k6-summary.json",
  axe: "reports/axe.json",
  ctrf: "ctrf/*.json",
  playwright_json: "playwright-report/results.json",
  cucumber_messages: "reports/cucumber-messages.ndjson",
};

/** The repository that publishes the action. */
export const ACTION_REPO = "shift3385/Pharos";
/** What the snippet shows when this build cannot name a commit GitHub has. */
export const SHA_PLACEHOLDER = "<SHA-de-40-caracteres>";

export interface CiSnippetInput {
  /** The project: its id (the API v1 also takes the case-id prefix). */
  project: string;
  /** The project's name, for a comment. */
  projectName?: string;
  formats: CiFormat[];
  /** The full SHA of the action's commit, or empty for the placeholder. */
  actionSha?: string;
  /** The Pharos version, for the comment next to the SHA. */
  version: string;
}

/** The YAML step, indented to go under a job's `steps:`. */
export function buildCiSnippet(input: CiSnippetInput): string {
  const sha = /^[0-9a-f]{40}$/.test(input.actionSha ?? "") ? input.actionSha : SHA_PLACEHOLDER;
  const formats = CI_FORMATS.filter((f) => input.formats.includes(f));
  const files = (formats.length > 0 ? formats : DEFAULT_CI_FORMATS).map((f) => `            ${CI_PATHS[f]}`);
  const projectLine = `          project: ${yamlScalar(input.project)}`;
  return [
    "      - name: Subir a Pharos",
    "        if: always()",
    `        uses: ${ACTION_REPO}/.github/actions/pharos-report@${sha} # Pharos ${input.version}`,
    "        with:",
    "          server: ${{ vars.PHAROS_URL }}",
    "          token: ${{ secrets.PHAROS_TOKEN }}",
    input.projectName ? `${projectLine} # ${input.projectName.replace(/[\r\n]/g, " ")}` : projectLine,
    "          close: true",
    "          files: |",
    ...files,
    "",
  ].join("\n");
}

/** A value YAML reads back as the same plain string. */
function yamlScalar(value: string): string {
  return /^[A-Za-z0-9_.-]+$/.test(value) ? value : JSON.stringify(value);
}
