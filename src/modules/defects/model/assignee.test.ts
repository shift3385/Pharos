import { describe, expect, it } from "vitest";
import { assigneeOptions } from "./assignee";

describe("«Asignado a» options (FIX-41)", () => {
  const members = [
    { userId: "u-liomar", name: "Liomar QA" },
    { userId: "u-jorge", name: "Jorge L. Meneses Yero" },
    { userId: "u-off", name: "Baja", disabled: true },
  ];

  it("offers nobody and the active members by name, storing their account", () => {
    expect(assigneeOptions(members, "", "Sin asignar")).toEqual([
      { value: "", label: "Sin asignar" },
      { value: "u-jorge", label: "Jorge L. Meneses Yero" },
      { value: "u-liomar", label: "Liomar QA" },
    ]);
  });

  it("keeps a name typed before there were members", () => {
    const options = assigneeOptions(members, "Equipo de backend", "Sin asignar");
    expect(options.at(-1)).toEqual({ value: "Equipo de backend", label: "Equipo de backend" });
    expect(assigneeOptions(members, "u-jorge", "Sin asignar")).toHaveLength(3);
  });
});
