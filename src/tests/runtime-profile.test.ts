import { describe, expect, it } from "vitest";
import { inferRuntimeProfile } from "@/lib/utils/runtime-profile";

describe("inferRuntimeProfile", () => {
  it("recomienda contencion visual en pantallas ultrapanoramicas", () => {
    const profile = inferRuntimeProfile({
      platform: "linux",
      viewportWidth: 2560,
      viewportHeight: 1080,
      devicePixelRatio: 1,
      cpuCores: 8,
      deviceMemoryGb: 16,
      scaleFactor: 1,
      observedWebviewScale: 1,
    });

    expect(profile.recommendedContainedLayout).toBe(true);
    expect(profile.recommendedLowResource).toBe(false);
  });

  it("detecta una discrepancia de escala en linux y sugiere correccion de zoom", () => {
    const profile = inferRuntimeProfile({
      platform: "linux",
      viewportWidth: 1600,
      viewportHeight: 900,
      devicePixelRatio: 1,
      cpuCores: 8,
      deviceMemoryGb: 16,
      scaleFactor: 1.25,
      observedWebviewScale: 1,
    });

    expect(profile.needsLinuxZoomCorrection).toBe(true);
    expect(profile.suggestedZoom).toBeCloseTo(1.2, 5);
  });

  it("recomienda modo de bajo recurso en equipos chicos", () => {
    const profile = inferRuntimeProfile({
      platform: "windows",
      viewportWidth: 1280,
      viewportHeight: 720,
      devicePixelRatio: 1,
      cpuCores: 4,
      deviceMemoryGb: 4,
      scaleFactor: 1,
      observedWebviewScale: 1,
    });

    expect(profile.recommendedLowResource).toBe(true);
    expect(profile.recommendedCompactDensity).toBe(true);
    expect(profile.recommendedReducedMotion).toBe(true);
  });
});
