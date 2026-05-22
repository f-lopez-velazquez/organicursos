import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoursePage } from "@/features/courses/components/CoursePage";
import { atlasApi } from "@/lib/api/atlas-api";
import { mockCourseDetail, mockSettings } from "@/lib/api/mock-data";
import { useAppStore } from "@/store/app-store";

vi.mock("@/features/covers/components/CoverStudioPanel", () => ({
  CoverStudioPanel: () => <div>CoverStudioPanel</div>,
}));

vi.mock("@/lib/utils/viewport-profile", () => ({
  useViewportProfile: () => ({
    width: 1440,
    height: 900,
    aspectRatio: 1.6,
    mode: "balanced",
    orientation: "landscape",
  }),
}));

function buildCourseFixture() {
  const lessonA = {
    ...mockCourseDetail.sections[0].lessons[0],
    id: 201,
    title: "Sesión 1 - Bienvenida",
    progressPercent: 42,
    progressSeconds: 300,
    lastViewedAt: new Date().toISOString(),
  };

  const lessonB = {
    ...mockCourseDetail.sections[0].lessons[1],
    id: 202,
    title: "Sesión 2 - Base del método",
    progressPercent: 0,
    progressSeconds: 0,
    completed: false,
    lastViewedAt: null,
  };

  const extraLessons = Array.from({ length: 6 }).map((_, index) => ({
    ...lessonB,
    id: 300 + index,
    title: `Práctica ${index + 1}`,
    progressPercent: index === 4 ? 100 : 0,
    progressSeconds: index === 4 ? 1200 : 0,
    completed: index === 4,
  }));

  return {
    ...mockCourseDetail,
    title: "Curso de prueba estructurado",
    sections: [
      {
        ...mockCourseDetail.sections[0],
        id: 91,
        title: "Módulo 1",
        lessons: [lessonA, lessonB, ...extraLessons.slice(0, 5)],
      },
      {
        ...mockCourseDetail.sections[0],
        id: 92,
        title: "Módulo 2",
        lessons: extraLessons.slice(5),
      },
    ],
  };
}

describe("CoursePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAppStore.setState({
      settings: mockSettings,
      refreshLibrary: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("permite cambiar entre temario, bloques y avance sin romper la pantalla", async () => {
    const fixture = buildCourseFixture();
    vi.spyOn(atlasApi, "getCourse").mockResolvedValue(fixture);

    render(
      <MemoryRouter initialEntries={["/courses/1"]}>
        <Routes>
          <Route path="/courses/:courseId" element={<CoursePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText("Curso de prueba estructurado");
    expect(screen.getByText("Temario del curso")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Bloques" }));
    expect(await screen.findByText("Módulo 1 - Bloque 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Avance" }));
    expect((await screen.findAllByText("En curso")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Por empezar").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Listas").length).toBeGreaterThan(0);
  }, 10000);

  it("permite enfocar rapido lo ya empezado con el filtro de retomar", async () => {
    const fixture = buildCourseFixture();
    vi.spyOn(atlasApi, "getCourse").mockResolvedValue(fixture);

    render(
      <MemoryRouter initialEntries={["/courses/1"]}>
        <Routes>
          <Route path="/courses/:courseId" element={<CoursePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText("Curso de prueba estructurado");
    fireEvent.click(screen.getByRole("button", { name: "Retomar" }));

    expect(await screen.findByText("1 elementos")).toBeInTheDocument();
    const playlist = screen.getByTestId("course-playlist");
    expect(within(playlist).getByText("Sesión 1 - Bienvenida")).toBeInTheDocument();
  });
});
