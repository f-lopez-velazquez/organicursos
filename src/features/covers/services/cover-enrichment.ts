import type { RemoteCoverSuggestion } from "@/types/domain";

interface CoverSearchInput {
  title: string;
  category?: string | null;
  tags?: string[];
  provider?: string;
}

interface CoverProvider {
  id: string;
  search(input: CoverSearchInput): Promise<RemoteCoverSuggestion[]>;
}

class OpenverseCoverProvider implements CoverProvider {
  id = "openverse";

  async search(input: CoverSearchInput) {
    const query = buildQuery(input);
    const url = new URL("https://api.openverse.org/v1/images/");
    url.searchParams.set("q", query);
    url.searchParams.set("page_size", "12");
    url.searchParams.set("license_type", "commercial");
    url.searchParams.set("mature", "false");

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("No se pudieron obtener sugerencias de portada.");
    }

    const payload = (await response.json()) as {
      results?: Array<{
        id: string;
        title?: string;
        thumbnail?: string;
        url?: string;
        creator?: string;
        license?: string;
      }>;
    };

    return (payload.results ?? [])
      .filter((item) => item.thumbnail && item.url)
      .map((item, index) => ({
        id: `${this.id}-${item.id}`,
        provider: this.id,
        title: item.title || input.title,
        previewUrl: item.thumbnail!,
        remoteUrl: item.url!,
        attribution: item.creator ? `${item.creator} · ${item.license ?? "licencia abierta"}` : item.license ?? null,
        score: Number((1 - index * 0.04).toFixed(2)),
      }))
      .slice(0, 8);
  }
}

const providers = new Map<string, CoverProvider>([["openverse", new OpenverseCoverProvider()]]);

export const coverEnrichmentService = {
  async searchCourseCoverSuggestions(input: CoverSearchInput) {
    const provider = providers.get(input.provider ?? "openverse");
    if (!provider) {
      return [];
    }
    return provider.search(input);
  },
};

function buildQuery(input: CoverSearchInput) {
  return [input.title, input.category, ...(input.tags ?? []).slice(0, 3)]
    .filter(Boolean)
    .join(" ")
    .trim();
}
