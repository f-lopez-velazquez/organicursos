import { describe, expect, it } from "vitest";
import { buildCourseInsightDraft, buildSimilarityDrafts, cosine } from "@/features/ai/services/ai-insights";
import type { PendingCourseAiDocument } from "@/types/domain";

const baseDocument: PendingCourseAiDocument = {
  courseId: 1,
  title: "React Profundo para Apps Reales",
  currentCategory: null,
  currentDifficulty: null,
  existingDescription: null,
  contentHash: "hash-react",
  text: "react hooks componentes asincronia fetch useEffect estado estado frontend",
  lessonCount: 18,
  totalDurationSeconds: 6400,
};

describe("ai-insights", () => {
  it("genera una sugerencia prudente de categoria, dificultad y etiquetas", () => {
    const insight = buildCourseInsightDraft(
      baseDocument,
      [
        { label: "Programación", score: 0.91 },
        { label: "Diseño", score: 0.21 },
      ],
      [
        { label: "Intermedio", score: 0.74 },
        { label: "Principiante", score: 0.32 },
      ],
    );

    expect(insight.inferredCategory).toBe("Programación");
    expect(insight.inferredDifficulty).toBe("Intermedio");
    expect(insight.tags.some((tag) => tag.name.includes("programación"))).toBe(true);
    expect(insight.suggestedDescription).toContain("18 lecciones");
  });

  it("detecta cursos relacionados y posibles duplicados por similitud vectorial", () => {
    const documents: PendingCourseAiDocument[] = [
      baseDocument,
      {
        ...baseDocument,
        courseId: 2,
        title: "React Profundo y Hooks",
        contentHash: "hash-react-2",
        text: "react hooks asincronia frontend fetch componentes efectos",
      },
      {
        ...baseDocument,
        courseId: 3,
        title: "Finanzas Personales",
        contentHash: "hash-finanzas",
        text: "presupuesto ahorro finanzas patrimonio gastos objetivos",
      },
    ];

    const vectors = [
      [1, 0, 0],
      [0.97, 0.03, 0],
      [0, 1, 0],
    ];

    const similarities = buildSimilarityDrafts(documents, vectors);
    expect(similarities).toHaveLength(1);
    expect(similarities[0].relatedCourseId).toBe(2);
    expect(["related", "duplicate_candidate"]).toContain(similarities[0].relationKind);
  });

  it("calcula coseno de forma estable", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
});
