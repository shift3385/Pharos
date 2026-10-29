import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders, i18n } from "@test/utils";
import { DbErrorScreen } from "./DbErrorScreen";
import { NEWER_DB_ERROR } from "./dbStatus";

describe("DbErrorScreen (SEC-06)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
  });

  it("explains a database written by a newer Pharos", () => {
    const error = `${NEWER_DB_ERROR}: unknown migrations: 0099_future.sql`;
    renderWithProviders(<DbErrorScreen error={error} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText("Estos datos son de una versión más nueva de Pharos"),
    ).toBeInTheDocument();
    expect(screen.getByText(error)).toBeInTheDocument();
  });

  it("falls back to a generic message for other open errors", async () => {
    await i18n.changeLanguage("en");
    renderWithProviders(<DbErrorScreen error="failed to decrypt local database" />);
    expect(screen.getByText("The local database could not be opened")).toBeInTheDocument();
  });
});
