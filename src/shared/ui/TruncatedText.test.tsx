import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TruncatedText } from "./TruncatedText";

describe("TruncatedText (SPEC §3)", () => {
  it("never wraps and keeps the full value in the tooltip", () => {
    render(<TruncatedText value="laura.mendez@pharos.app" />);
    const el = screen.getByText("laura.mendez@pharos.app");
    expect(el).toHaveClass("u-truncate");
    expect(el).toHaveAttribute("title", "laura.mendez@pharos.app");
  });

  it("uses the monospace ID style on request", () => {
    render(<TruncatedText value="PCL-0142" mono />);
    expect(screen.getByText("PCL-0142")).toHaveClass("u-truncate", "t-id");
  });
});
