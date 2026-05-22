import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "@/lib/api/tauri";
import type { OperationalProfile, RuntimeProfile } from "@/types/domain";

interface RuntimeSignalInput {
  platform?: string | null;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio?: number | null;
  cpuCores?: number | null;
  deviceMemoryGb?: number | null;
  scaleFactor?: number | null;
  observedWebviewScale?: number | null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizePositiveNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function inferRuntimeProfile(input: RuntimeSignalInput): RuntimeProfile {
  const platform = (input.platform ?? "unknown").toLowerCase();
  const cpuCores = normalizePositiveNumber(input.cpuCores);
  const deviceMemoryGb = normalizePositiveNumber(input.deviceMemoryGb);
  const scaleFactor = normalizePositiveNumber(input.scaleFactor);
  const observedWebviewScale = normalizePositiveNumber(input.observedWebviewScale);
  const viewportWidth = Math.max(input.viewportWidth, 1);
  const viewportHeight = Math.max(input.viewportHeight, 1);
  const aspectRatio = viewportWidth / viewportHeight;
  const devicePixelRatio = normalizePositiveNumber(input.devicePixelRatio) ?? 1;
  const renderScale = observedWebviewScale ?? devicePixelRatio;
  const scaleMismatch = scaleFactor ? Math.abs(scaleFactor - renderScale) : 0;
  const fractionalScale = scaleFactor ? Math.abs(scaleFactor - Math.round(scaleFactor)) > 0.05 : false;

  const recommendedLowResource =
    viewportWidth < 1320 ||
    viewportHeight < 820 ||
    (cpuCores !== null && cpuCores <= 4) ||
    (deviceMemoryGb !== null && deviceMemoryGb <= 4);
  const recommendedCompactDensity =
    recommendedLowResource || viewportWidth < 1480 || viewportHeight < 900 || aspectRatio < 1.42;
  const recommendedContainedLayout = aspectRatio > 1.9 || viewportWidth > 1860 || fractionalScale;
  const recommendedReducedMotion = recommendedLowResource || (platform === "linux" && fractionalScale);
  const needsLinuxZoomCorrection = platform === "linux" && scaleFactor !== null && scaleMismatch > 0.12;
  const suggestedZoom = needsLinuxZoomCorrection ? clamp(scaleFactor! / renderScale, 0.85, 1.2) : 1;

  return {
    platform,
    cpuCores,
    deviceMemoryGb,
    scaleFactor,
    devicePixelRatio,
    observedWebviewScale,
    recommendedLowResource,
    recommendedCompactDensity,
    recommendedReducedMotion,
    recommendedContainedLayout,
    needsLinuxZoomCorrection,
    suggestedZoom,
  };
}

export async function collectRuntimeProfile(
  operationalProfile: OperationalProfile | null,
  viewport: { width: number; height: number },
): Promise<RuntimeProfile> {
  const navigatorWithMemory = typeof navigator !== "undefined" ? (navigator as Navigator & { deviceMemory?: number }) : null;
  const devicePixelRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const cpuCores =
    typeof navigator !== "undefined" && typeof navigator.hardwareConcurrency === "number"
      ? navigator.hardwareConcurrency
      : null;
  const deviceMemoryGb = typeof navigatorWithMemory?.deviceMemory === "number" ? navigatorWithMemory.deviceMemory : null;

  let scaleFactor: number | null = null;
  let observedWebviewScale: number | null = null;

  if (isTauriRuntime() && typeof window !== "undefined") {
    try {
      const [windowScaleFactor, webviewSize] = await Promise.all([getCurrentWindow().scaleFactor(), getCurrentWebview().size()]);
      scaleFactor = windowScaleFactor;
      if (webviewSize.width > 0 && window.innerWidth > 0) {
        observedWebviewScale = webviewSize.width / window.innerWidth;
      }
    } catch {
      // Fall back to browser-only signals if the Tauri APIs are not available yet.
    }
  }

  return inferRuntimeProfile({
    platform: operationalProfile?.platform ?? null,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    devicePixelRatio,
    cpuCores,
    deviceMemoryGb,
    scaleFactor,
    observedWebviewScale,
  });
}

export async function applyRuntimeZoomCorrection(profile: RuntimeProfile) {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    await getCurrentWebview().setZoom(profile.needsLinuxZoomCorrection ? profile.suggestedZoom : 1);
  } catch {
    // Keep the app usable even if the runtime does not allow programmatic zoom.
  }
}
