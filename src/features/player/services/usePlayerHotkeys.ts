import { type RefObject, useEffect } from "react";

interface UsePlayerHotkeysArgs {
  videoRef: RefObject<HTMLVideoElement>;
  onToggleTheater: () => void;
  onToggleMuted: () => void;
}

export function usePlayerHotkeys({ videoRef, onToggleMuted, onToggleTheater }: UsePlayerHotkeysArgs) {
  useEffect(() => {
    const handler = async (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName) || target.isContentEditable)) {
        return;
      }

      const video = videoRef.current;
      if (!video) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case " ":
        case "k":
          event.preventDefault();
          if (video.paused) {
            await video.play();
          } else {
            video.pause();
          }
          break;
        case "arrowleft":
        case "j":
          video.currentTime = Math.max(0, video.currentTime - 10);
          break;
        case "arrowright":
        case "l":
          video.currentTime = video.currentTime + 10;
          break;
        case "arrowup":
          video.volume = Math.min(1, video.volume + 0.05);
          break;
        case "arrowdown":
          video.volume = Math.max(0, video.volume - 0.05);
          break;
        case "m":
          onToggleMuted();
          break;
        case "t":
          onToggleTheater();
          break;
        case ">":
        case ".":
          video.playbackRate = Math.min(2, Number((video.playbackRate + 0.1).toFixed(2)));
          break;
        case "<":
        case ",":
          video.playbackRate = Math.max(0.5, Number((video.playbackRate - 0.1).toFixed(2)));
          break;
        case "p":
          if ("pictureInPictureEnabled" in document && document.pictureInPictureEnabled) {
            if (document.pictureInPictureElement) {
              await document.exitPictureInPicture();
            } else if ("requestPictureInPicture" in video) {
              await video.requestPictureInPicture();
            }
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onToggleMuted, onToggleTheater, videoRef]);
}
