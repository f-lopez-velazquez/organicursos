import { atlasApi } from "@/lib/api/atlas-api";
import { localAiService } from "@/features/ai/services/local-ai";
import type { AppSettings, SearchQueryInput, SearchResult } from "@/types/domain";

export function mergeResults(lexical: SearchResult[], semantic: SearchResult[]) {
  const map = new Map<string, SearchResult>();

  for (const result of lexical) {
    map.set(`${result.entityType}:${result.entityId}`, result);
  }

  for (const result of semantic) {
    const key = `${result.entityType}:${result.entityId}`;
    const previous = map.get(key);
    if (!previous) {
      map.set(key, result);
      continue;
    }

    map.set(key, {
      ...previous,
      score: previous.lexicalScore * 0.55 + result.semanticScore * 0.45,
      semanticScore: result.semanticScore,
    });
  }

  return Array.from(map.values()).sort((left, right) => right.score - left.score);
}

export async function runHybridSearch(query: string, settings: AppSettings | null, filters?: SearchQueryInput["filters"]) {
  const lexical = await atlasApi.search({
    query,
    mode: "text",
    limit: 20,
    filters,
  });

  const hasFilters = Boolean(filters && Object.values(filters).some((value) => value !== undefined && value !== ""));
  if (!settings || hasFilters || settings.aiProcessingEnabled === false || settings.lowResourceMode === true) {
    return lexical;
  }

  const [queryVector] = await localAiService.embed([query], settings.modelName);
  const semantic = await atlasApi.semanticSearch(queryVector, 10);
  return mergeResults(lexical, semantic);
}
