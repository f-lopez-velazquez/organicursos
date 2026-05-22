import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils/cn";

describe("cn", () => {
  it("fusiona clases preservando overrides de Tailwind", () => {
    expect(cn("px-3 py-2", "px-4", false && "hidden")).toBe("py-2 px-4");
  });
});
