import { convertFileSrc } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/lib/api/tauri";

const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

function normalizeFilePath(path: string) {
  return path.replace(/\\/g, "/");
}

function encodePathForMediaServer(path: string) {
  const bytes = new TextEncoder().encode(path);
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function mediaBaseUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.__ORGANICURSOS_MEDIA_BASE__ ?? null;
}

export function toDirectFileUrl(path: string | null | undefined) {
  if (!path) {
    return null;
  }

  if (SCHEME_PATTERN.test(path)) {
    return path;
  }

  const normalizedPath = normalizeFilePath(path);
  const encodedPath = normalizedPath
    .split("/")
    .map((segment, index) => (index === 0 ? segment : encodeURIComponent(segment)))
    .join("/");

  if (/^[a-zA-Z]:\//.test(normalizedPath)) {
    return `file:///${encodedPath}`;
  }

  return `file://${encodedPath}`;
}

export function toAppFileUrl(path: string | null | undefined) {
  if (!path) {
    return null;
  }

  if (SCHEME_PATTERN.test(path)) {
    return path;
  }

  if (isTauriRuntime()) {
    const mediaUrl = mediaBaseUrl();
    if (mediaUrl) {
      return `${mediaUrl}/local-file/${encodePathForMediaServer(path)}`;
    }

    try {
      return convertFileSrc(path);
    } catch {
      return toDirectFileUrl(path);
    }
  }

  return toDirectFileUrl(path) ?? path;
}

export function applyLocalFileUrlFallback(
  event: { currentTarget: HTMLImageElement },
  path: string | null | undefined,
) {
  if (isTauriRuntime()) {
    return;
  }

  const fallbackUrl = toDirectFileUrl(path);
  if (!fallbackUrl) {
    return;
  }

  const image = event.currentTarget;
  if (image.dataset.fileFallbackApplied === "1" || image.currentSrc === fallbackUrl) {
    return;
  }

  image.dataset.fileFallbackApplied = "1";
  image.src = fallbackUrl;
}
