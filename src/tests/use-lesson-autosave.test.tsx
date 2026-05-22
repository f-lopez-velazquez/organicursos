import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLessonAutosave } from "@/features/player/services/useLessonAutosave";
import { atlasApi } from "@/lib/api/atlas-api";
import { mockSettings } from "@/lib/api/mock-data";
import * as lessonResumeCache from "@/features/player/services/lesson-resume-cache";
import { useAppStore } from "@/store/app-store";

function AutosaveHarness() {
  const videoRef = useRef<HTMLVideoElement>(null);
  useLessonAutosave({ lessonId: 910, videoRef });
  return <video ref={videoRef} data-testid="lesson-video" />;
}

describe("useLessonAutosave", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAppStore.setState({ settings: mockSettings });
  });

  it("guarda un checkpoint local rapido y persiste al pausar", async () => {
    vi.spyOn(atlasApi, "saveLessonProgress").mockResolvedValue(undefined);
    const checkpointSpy = vi.spyOn(lessonResumeCache, "writeLessonResumeCheckpoint");

    render(<AutosaveHarness />);

    const video = screen.getByTestId("lesson-video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 1800,
    });
    video.currentTime = 642;
    video.playbackRate = 1.25;
    video.volume = 0.8;

    fireEvent.timeUpdate(video);

    expect(checkpointSpy).toHaveBeenCalledWith(expect.objectContaining({
      lessonId: 910,
      currentTimeSeconds: 642,
      progressPercent: 36,
      completed: false,
      speed: 1.25,
      volume: expect.any(Number),
      savedAt: expect.any(String),
    }));

    fireEvent.pause(video);

    await waitFor(() =>
      expect(atlasApi.saveLessonProgress).toHaveBeenCalledWith({
        lessonId: 910,
        currentTimeSeconds: 642,
        speed: 1.25,
        volume: 0.8,
        completed: false,
      }),
    );
  });
});
