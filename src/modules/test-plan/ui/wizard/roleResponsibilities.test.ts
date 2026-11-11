// IA-13: the AI only suggests responsibilities for the roles the user wrote, and
// accepting them fills those rows and nothing else.
import { describe, expect, it } from "vitest";
import { rolesWithoutResponsibility, withResponsibilities } from "./formState";

const ROLES = [
  { role: "Líder de QA", responsibility: "Aprueba el cierre" },
  { role: " Tester ", responsibility: "" },
  { role: "Product Owner", responsibility: "   " },
  { role: "", responsibility: "" },
];

describe("responsibilities suggested by the AI", () => {
  it("asks only for the roles written and still without a responsibility", () => {
    expect(rolesWithoutResponsibility(ROLES)).toEqual(["Tester", "Product Owner"]);
    expect(rolesWithoutResponsibility([{ role: "Líder", responsibility: "Decide" }])).toEqual([]);
  });

  it("fills those rows, keeping the role as the user wrote it", () => {
    const next = withResponsibilities(ROLES, [{ role: "Tester", responsibility: "Ejecuta los casos" }]);
    expect(next[1]).toEqual({ role: " Tester ", responsibility: "Ejecuta los casos" });
    expect(next[0]).toEqual(ROLES[0]);
    expect(next[2]).toEqual(ROLES[2]);
    expect(next).toHaveLength(ROLES.length);
  });

  it("never overwrites what was written meanwhile, nor adds a row", () => {
    const next = withResponsibilities(ROLES, [
      { role: "Líder de QA", responsibility: "Otra cosa" },
      { role: "CEO", responsibility: "Dirige" },
    ]);
    expect(next).toEqual(ROLES);
  });
});
