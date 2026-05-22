import { useSyncExternalStore } from "react";

export type ViewportMode = "compact" | "balanced" | "wide";
export type ViewportOrientation = "portrait" | "landscape";

export interface ViewportProfile {
  width: number;
  height: number;
  aspectRatio: number;
  mode: ViewportMode;
  orientation: ViewportOrientation;
}

function readWindowProfile(): ViewportProfile {
  if (typeof window === "undefined") {
    return {
      width: 1440,
      height: 900,
      aspectRatio: 1.6,
      mode: "balanced",
      orientation: "landscape",
    };
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const aspectRatio = width / Math.max(height, 1);
  const orientation = aspectRatio >= 1 ? "landscape" : "portrait";
  const ultraWide = aspectRatio >= 1.95;

  const mode: ViewportMode =
    width < 1280 || height < 760 || aspectRatio < 1.28
      ? "compact"
      : !ultraWide && width >= 1680 && height >= 880 && aspectRatio > 1.45
        ? "wide"
        : "balanced";

  return {
    width,
    height,
    aspectRatio,
    mode,
    orientation,
  };
}

let cachedProfile = readWindowProfile();
const subscribers = new Set<() => void>();
let listening = false;

function emitChange() {
  cachedProfile = readWindowProfile();
  subscribers.forEach((callback) => callback());
}

function subscribe(callback: () => void) {
  subscribers.add(callback);

  if (typeof window !== "undefined" && !listening) {
    listening = true;
    window.addEventListener("resize", emitChange);
  }

  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0 && typeof window !== "undefined" && listening) {
      listening = false;
      window.removeEventListener("resize", emitChange);
    }
  };
}

export function useViewportProfile() {
  return useSyncExternalStore(subscribe, () => cachedProfile, () => cachedProfile);
}
