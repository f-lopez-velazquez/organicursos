import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LessonPlayerPage } from "@/features/player/components/LessonPlayerPage";
import { atlasApi } from "@/lib/api/atlas-api";
import { mockLessonPayload, mockSettings } from "@/lib/api/mock-data";
import { useAppStore } from "@/store/app-store";

vi.mock("@/lib/utils/viewport-profile", () => ({
  useViewportProfile: () => ({
    width: 1440,
    height: 900,
    aspectRatio: 1.6,
    mode: "balanced",
    orientation: "landscape",
  }),
}));

vi.mock("@/features/player/services/useLessonAutosave", () => ({
  useLessonAutosave: vi.fn(),
}));

vi.mock("@/features/player/services/usePlayerHotkeys", () => ({
  usePlayerHotkeys: vi.fn(),
}));

function buildPayload(id: number, title: string, nextLessonId: number | null) {
  return {
    ...mockLessonPayload,
    lesson: {
      ...mockLessonPayload.lesson,
      id,
      title,
      progressPercent: id === 110 ? 36 : 0,
      progressSeconds: id === 110 ? 628 : 0,
      completed: false,
    },
    nextLessonId,
    previousLessonId: id === 110 ? null : 110,
  };
}

describe("LessonPlayerPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAppStore.setState({
      settings: mockSettings,
      refreshLibrary: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("renderiza la clase y avanza automaticamente a la siguiente al terminar", async () => {
    const firstPayload = buildPayload(110, "Clase uno", 111);
    const secondPayload = buildPayload(111, "Clase dos", null);

    vi.spyOn(atlasApi, "getLessonPlayerPayload").mockImplementation(async (lessonId: number) => {
      return lessonId === 111 ? secondPayload : firstPayload;
    });
    vi.spyOn(atlasApi, "saveLessonProgress").mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={["/lessons/110"]}>
        <Routes>
          <Route path="/lessons/:lessonId" element={<LessonPlayerPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText("Clase uno");
    const video = document.querySelector("video") as HTMLVideoElement | null;
    expect(video).not.toBeNull();

    Object.defineProperty(video!, "duration", {
      configurable: true,
      value: 1740,
    });
    video!.currentTime = 1740;

    fireEvent.ended(video!);

    expect(await screen.findByText("Clase dos")).toBeInTheDocument();
  });

  it("permite guardar un marcador desde la clase abierta", async () => {
    const payload = buildPayload(110, "Clase uno", 111);
    vi.spyOn(atlasApi, "getLessonPlayerPayload").mockResolvedValue(payload);
    vi.spyOn(atlasApi, "saveLessonProgress").mockResolvedValue(undefined);
    vi.spyOn(atlasApi, "createBookmark").mockResolvedValue({
      id: 999,
      lessonId: 110,
      timestampSeconds: 26,
      label: "Idea clave",
      createdAt: new Date().toISOString(),
    });

    render(
      <MemoryRouter initialEntries={["/lessons/110"]}>
        <Routes>
          <Route path="/lessons/:lessonId" element={<LessonPlayerPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText("Clase uno");

    const video = document.querySelector("video") as HTMLVideoElement | null;
    expect(video).not.toBeNull();
    video!.currentTime = 26;

    fireEvent.change(screen.getByPlaceholderText("Ponle un nombre a este momento"), {
      target: { value: "Idea clave" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Guardar momento/ }));

    expect(await screen.findByText("Idea clave")).toBeInTheDocument();
  });

  it("permite arrastrar el control de progreso y saltar a otro momento del video", async () => {
    const payload = buildPayload(110, "Clase uno", 111);
    vi.spyOn(atlasApi, "getLessonPlayerPayload").mockResolvedValue(payload);
    vi.spyOn(atlasApi, "saveLessonProgress").mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={["/lessons/110"]}>
        <Routes>
          <Route path="/lessons/:lessonId" element={<LessonPlayerPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText("Clase uno");

    const video = document.querySelector("video") as HTMLVideoElement | null;
    expect(video).not.toBeNull();
    Object.defineProperty(video!, "duration", {
      configurable: true,
      value: 1740,
    });
    video!.currentTime = 120;

    const slider = screen.getByLabelText("Avance de la clase");
    fireEvent.change(slider, { target: { value: "900" } });
    fireEvent.mouseUp(slider);

    expect(video!.currentTime).toBe(900);
  });

  it("prepara la siguiente clase antes de terminar cuando el avance ya va cerca del final", async () => {
    const firstPayload = buildPayload(110, "Clase uno", 111);
    const secondPayload = buildPayload(111, "Clase dos", null);

    vi.spyOn(atlasApi, "getLessonPlayerPayload").mockImplementation(async (targetLessonId: number) => {
      return targetLessonId === 111 ? secondPayload : firstPayload;
    });
    vi.spyOn(atlasApi, "saveLessonProgress").mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={["/lessons/110"]}>
        <Routes>
          <Route path="/lessons/:lessonId" element={<LessonPlayerPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText("Clase uno");

    const video = document.querySelector("video") as HTMLVideoElement | null;
    expect(video).not.toBeNull();
    Object.defineProperty(video!, "duration", {
      configurable: true,
      value: 1740,
    });

    video!.currentTime = 1610;
    fireEvent.timeUpdate(video!);

    await waitFor(() => expect(atlasApi.getLessonPlayerPayload).toHaveBeenCalledWith(111));
  });
});
