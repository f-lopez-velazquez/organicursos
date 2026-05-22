import { describe, expect, it } from "vitest";
import { computeCompleted, formatPlaybackTime } from "@/features/player/services/player-utils";

describe("player-utils", () => {
  it("formats playback time with and without hours", () => {
    expect(formatPlaybackTime(65)).toBe("01:05");
    expect(formatPlaybackTime(3723)).toBe("01:02:03");
  });

  it("computes completion based on threshold", () => {
    expect(computeCompleted(92, 100, 92)).toBe(true);
    expect(computeCompleted(91, 100, 92)).toBe(false);
  });
});
