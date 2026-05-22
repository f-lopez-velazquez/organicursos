import { describe, expect, it } from "vitest";
import { mergeResults } from "@/features/search/services/hybrid-search";
import type { SearchResult } from "@/types/domain";

const lexical: SearchResult[] = [
  {
    entityType: "lesson",
    entityId: 1,
    title: "Async Await",
    snippet: "Lexical",
    score: 0.8,
    lexicalScore: 0.8,
    semanticScore: 0,
    courseId: 1,
    lessonId: 1,
  },
];

const semantic: SearchResult[] = [
  {
    entityType: "lesson",
    entityId: 1,
    title: "Async Await",
    snippet: "Semantic",
    score: 0.9,
    lexicalScore: 0,
    semanticScore: 0.9,
    courseId: 1,
    lessonId: 1,
  },
  {
    entityType: "asset",
    entityId: 2,
    title: "Hooks PDF",
    snippet: "Semantic asset",
    score: 0.7,
    lexicalScore: 0,
    semanticScore: 0.7,
    courseId: 1,
    lessonId: null,
  },
];

describe("mergeResults", () => {
  it("combina lexical y semantic sin duplicar entidades", () => {
    const merged = mergeResults(lexical, semantic);

    expect(merged).toHaveLength(2);
    expect(merged[0].entityId).toBe(1);
    expect(merged[0].score).toBeCloseTo(0.845);
  });
});
