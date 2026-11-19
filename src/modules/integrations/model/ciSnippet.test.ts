import { describe, expect, it } from "vitest";
import { buildCiSnippet, SHA_PLACEHOLDER } from "./ciSnippet";

const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";

describe("buildCiSnippet (INT-04)", () => {
  it("builds the step with the four reports of the exit criterion, pinned by SHA", () => {
    const yaml = buildCiSnippet({ project: "p1", projectName: "Pagos Web", formats: ["junit", "sarif", "k6", "axe"], actionSha: SHA, version: "0.6.0" });
    expect(yaml).toBe(
      [
        "      - name: Subir a Pharos",
        "        if: always()",
        `        uses: shift3385/Pharos/.github/actions/pharos-report@${SHA} # Pharos 0.6.0`,
        "        with:",
        "          server: ${{ vars.PHAROS_URL }}",
        "          token: ${{ secrets.PHAROS_TOKEN }}",
        "          project: p1 # Pagos Web",
        "          close: true",
        "          files: |",
        "            test-results/*.xml",
        "            reports/*.sarif",
        "            reports/k6-summary.json",
        "            reports/axe.json",
        "",
      ].join("\n"),
    );
  });

  it("never carries a token, and shows the placeholder without a known commit", () => {
    const yaml = buildCiSnippet({ project: "p1", formats: ["junit"], actionSha: "", version: "0.6.0" });
    expect(yaml).toContain(`pharos-report@${SHA_PLACEHOLDER}`);
    expect(yaml).not.toMatch(/phr_/);
    expect(yaml).toContain("${{ secrets.PHAROS_TOKEN }}");
    // A short SHA is not a pin.
    expect(buildCiSnippet({ project: "p1", formats: ["junit"], actionSha: "3d3c42e", version: "x" })).toContain(SHA_PLACEHOLDER);
  });

  it("keeps the formats in a fixed order and quotes an odd project id", () => {
    const yaml = buildCiSnippet({ project: "p 1:x", projectName: "A\nB", formats: ["axe", "junit"], version: "0.6.0" });
    expect(yaml.indexOf("test-results/*.xml")).toBeLessThan(yaml.indexOf("reports/axe.json"));
    expect(yaml).toContain('project: "p 1:x" # A B');
    // Nothing chosen: the default four.
    expect(buildCiSnippet({ project: "p1", formats: [], version: "0.6.0" })).toContain("reports/k6-summary.json");
  });
});
