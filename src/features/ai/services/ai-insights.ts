import type { PendingCourseAiDocument } from "@/types/domain";

export interface LabelScore {
  label: string;
  score: number;
}

export interface CourseInsightDraft {
  courseId: number;
  inferredTitle: string | null;
  inferredCategory: string | null;
  inferredDifficulty: string | null;
  suggestedDescription: string | null;
  inferenceConfidence: number | null;
  contentHash: string;
  evidenceJson: {
    categoryScores: LabelScore[];
    difficultyScores: LabelScore[];
    keywords: string[];
  };
  tags: Array<{ name: string; confidence: number | null }>;
}

export interface SimilarityDraft {
  courseId: number;
  relatedCourseId: number;
  similarity: number;
  relationKind: string;
  evidence: string | null;
}

export const CATEGORY_LABELS = [
  "Programación",
  "Negocios",
  "Finanzas",
  "Diseño",
  "Marketing",
  "Idiomas",
  "Datos",
  "Productividad",
  "Multimedia",
] as const;

export const DIFFICULTY_LABELS = ["Principiante", "Intermedio", "Avanzado"] as const;

const STOP_WORDS = new Set([
  "curso",
  "clase",
  "clases",
  "leccion",
  "lecciones",
  "modulo",
  "modulos",
  "para",
  "desde",
  "sobre",
  "nivel",
  "bases",
  "guia",
  "guía",
  "introduccion",
  "introducción",
  "profundo",
  "real",
  "reales",
  "con",
  "sin",
  "los",
  "las",
  "del",
  "una",
  "unos",
  "unas",
  "como",
  "qué",
  "que",
  "por",
  "and",
  "the",
  "this",
  "that",
  "from",
  "para",
  "apps",
]);

export function buildCourseInsightDraft(
  document: PendingCourseAiDocument,
  categoryScores: LabelScore[],
  difficultyScores: LabelScore[],
): CourseInsightDraft {
  const orderedCategoryScores = [...categoryScores].sort((left, right) => right.score - left.score);
  const orderedDifficultyScores = [...difficultyScores].sort((left, right) => right.score - left.score);
  const bestCategory = orderedCategoryScores[0];
  const bestDifficulty = orderedDifficultyScores[0];
  const keywords = extractKeywords(document);

  const inferredCategory =
    document.currentCategory ?? (bestCategory && bestCategory.score >= 0.38 ? bestCategory.label : null);
  const inferredDifficulty =
    document.currentDifficulty ?? (bestDifficulty && bestDifficulty.score >= 0.34 ? bestDifficulty.label : null);
  const inferredTitle = cleanupTitle(document.title);
  const suggestionConfidence = pickConfidence(bestCategory, bestDifficulty);

  return {
    courseId: document.courseId,
    inferredTitle,
    inferredCategory,
    inferredDifficulty,
    suggestedDescription:
      document.existingDescription ?? buildDescription(document, inferredCategory, inferredDifficulty, keywords),
    inferenceConfidence: suggestionConfidence,
    contentHash: document.contentHash,
    evidenceJson: {
      categoryScores: orderedCategoryScores.slice(0, 4),
      difficultyScores: orderedDifficultyScores,
      keywords: keywords.slice(0, 8),
    },
    tags: buildTags(document, orderedCategoryScores, keywords),
  };
}

export function buildSimilarityDrafts(
  documents: PendingCourseAiDocument[],
  vectors: number[][],
  limitPerCourse = 3,
): SimilarityDraft[] {
  const pairs: SimilarityDraft[] = [];
  const perCourseCount = new Map<number, number>();

  for (let leftIndex = 0; leftIndex < documents.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < documents.length; rightIndex += 1) {
      const similarity = cosine(vectors[leftIndex], vectors[rightIndex]);
      if (similarity < 0.78) {
        continue;
      }

      const leftCourseId = documents[leftIndex].courseId;
      const rightCourseId = documents[rightIndex].courseId;
      const leftCount = perCourseCount.get(leftCourseId) ?? 0;
      const rightCount = perCourseCount.get(rightCourseId) ?? 0;
      if (leftCount >= limitPerCourse || rightCount >= limitPerCourse) {
        continue;
      }

      const overlap = overlappingKeywords(documents[leftIndex], documents[rightIndex]);
      pairs.push({
        courseId: leftCourseId,
        relatedCourseId: rightCourseId,
        similarity,
        relationKind: similarity >= 0.92 ? "duplicate_candidate" : "related",
        evidence: overlap.length > 0 ? `Coincidencias: ${overlap.slice(0, 4).join(", ")}.` : null,
      });
      perCourseCount.set(leftCourseId, leftCount + 1);
      perCourseCount.set(rightCourseId, rightCount + 1);
    }
  }

  return pairs.sort((left, right) => right.similarity - left.similarity);
}

export function cosine(left: number[], right: number[]) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function buildTags(
  document: PendingCourseAiDocument,
  orderedCategoryScores: LabelScore[],
  keywords: string[],
) {
  const tagMap = new Map<string, number>();
  const bestCategory = orderedCategoryScores[0];

  if (bestCategory && bestCategory.score >= 0.38) {
    tagMap.set(bestCategory.label.toLowerCase(), Number(bestCategory.score.toFixed(2)));
  }

  for (const keyword of keywords.slice(0, 5)) {
    const score = tagMap.has(keyword) ? tagMap.get(keyword)! : keyword.length >= 8 ? 0.76 : 0.64;
    tagMap.set(keyword, score);
  }

  if (document.lessonCount >= 12) {
    tagMap.set("curso extenso", 0.58);
  }

  return Array.from(tagMap.entries())
    .map(([name, confidence]) => ({ name, confidence }))
    .slice(0, 6);
}

function extractKeywords(document: PendingCourseAiDocument) {
  const frequency = new Map<string, number>();
  const source = `${document.title}\n${document.text}`.toLowerCase();

  for (const token of source
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/[^a-z0-9áéíóúñ]+/i)) {
    if (token.length < 4 || STOP_WORDS.has(token)) {
      continue;
    }
    frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }

  return Array.from(frequency.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([token]) => token)
    .slice(0, 10);
}

function cleanupTitle(title: string) {
  return title
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDescription(
  document: PendingCourseAiDocument,
  category: string | null,
  difficulty: string | null,
  keywords: string[],
) {
  if (keywords.length < 2) {
    return null;
  }

  const focus = keywords.slice(0, 3).join(", ");
  const level = difficulty ? difficulty.toLowerCase() : "guiado";
  const categoryText = category ? `de ${category.toLowerCase()}` : "";
  return `Curso ${categoryText} con ${document.lessonCount} lecciones y enfoque ${level} sobre ${focus}.`;
}

function pickConfidence(bestCategory?: LabelScore, bestDifficulty?: LabelScore) {
  const scores = [bestCategory?.score ?? 0, bestDifficulty?.score ?? 0].filter((score) => score > 0);
  if (scores.length === 0) {
    return null;
  }
  return Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2));
}

function overlappingKeywords(left: PendingCourseAiDocument, right: PendingCourseAiDocument) {
  const leftKeywords = new Set(extractKeywords(left));
  return extractKeywords(right).filter((keyword) => leftKeywords.has(keyword));
}
