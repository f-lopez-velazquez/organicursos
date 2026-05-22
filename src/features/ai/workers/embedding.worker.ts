type WorkerRequest =
  | { id: string; type: "embed"; texts: string[]; modelName: string }
  | { id: string; type: "classify"; text: string; labels: string[]; modelName: string }
  | { id: string; type: "summarize"; text: string; modelName: string }
  | { id: string; type: "transcribe"; audioUrl: string; modelName: string };

type WorkerResponse =
  | { id: string; type: "embed"; vectors: number[][] }
  | { id: string; type: "classify"; scores: Array<{ label: string; score: number }> }
  | { id: string; type: "summarize"; summary: string; highlights: string[] }
  | { id: string; type: "transcribe"; text: string; chunks: Array<{ start: number; end: number; text: string }> };

type FeatureExtractor = (text: string, options: Record<string, unknown>) => Promise<{ data: Float32Array }>;
type AsrPipeline = (
  audio: string,
  options: Record<string, unknown>,
) => Promise<{ text: string; chunks?: Array<{ timestamp?: [number, number]; text: string }> }>;

const extractorCache = new Map<string, Promise<FeatureExtractor>>();
const asrCache = new Map<string, Promise<AsrPipeline>>();

async function getExtractor(modelName: string) {
  if (!extractorCache.has(modelName)) {
    const { pipeline } = (await import("@huggingface/transformers")) as {
      pipeline: (
        task: string,
        model: string,
        options: Record<string, unknown>,
      ) => Promise<FeatureExtractor>;
    };
    extractorCache.set(
      modelName,
      pipeline("feature-extraction", modelName, {
        dtype: "q8",
      }),
    );
  }

  return extractorCache.get(modelName)!;
}

async function getAsr(modelName: string) {
  const asrModel = modelName || "Xenova/whisper-tiny";
  if (!asrCache.has(asrModel)) {
    const { pipeline } = (await import("@huggingface/transformers")) as {
      pipeline: (
        task: string,
        model: string,
        options: Record<string, unknown>,
      ) => Promise<AsrPipeline>;
    };
    asrCache.set(
      asrModel,
      pipeline("automatic-speech-recognition", asrModel, {
        dtype: "q8",
      }),
    );
  }

  return asrCache.get(asrModel)!;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const payload = event.data;
  if (payload.type === "transcribe") {
    const asr = await getAsr(payload.modelName);
    const result = await asr(payload.audioUrl, {
      chunk_length_s: 28,
      stride_length_s: 4,
      return_timestamps: true,
    });

    postMessage({
      id: payload.id,
      type: "transcribe",
      text: result.text?.trim() ?? "",
      chunks: (result.chunks ?? [])
        .map((chunk) => ({
          start: Number(chunk.timestamp?.[0] ?? 0),
          end: Number(chunk.timestamp?.[1] ?? chunk.timestamp?.[0] ?? 0),
          text: chunk.text?.trim() ?? "",
        }))
        .filter((chunk) => chunk.text.length > 0),
    } satisfies WorkerResponse);
    return;
  }

  const extractor = await getExtractor(payload.modelName);

  if (payload.type === "embed") {
    const vectors = await Promise.all(
      payload.texts.map(async (text) => {
        const result = await extractor(text, {
          pooling: "mean",
          normalize: true,
        });
        return Array.from(result.data);
      }),
    );

    postMessage({
      id: payload.id,
      type: "embed",
      vectors,
    } satisfies WorkerResponse);
    return;
  }

  if (payload.type === "summarize") {
    const candidates = payload.text
      .replace(/\r/g, "\n")
      .split(/[\n.!?]+/)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length >= 32)
      .slice(0, 48);

    if (candidates.length === 0) {
      postMessage({
        id: payload.id,
        type: "summarize",
        summary: "",
        highlights: [],
      } satisfies WorkerResponse);
      return;
    }

    const [originVector, ...candidateVectors] = await Promise.all(
      [payload.text, ...candidates].map((text) =>
        extractor(text, {
          pooling: "mean",
          normalize: true,
        }),
      ),
    );
    const origin = Array.from(originVector.data);
    const ranked = candidates
      .map((candidate, index) => ({
        text: candidate,
        score: cosine(origin, Array.from(candidateVectors[index].data)),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);

    const summary = buildSummary(ranked.map((entry) => entry.text));
    postMessage({
      id: payload.id,
      type: "summarize",
      summary,
      highlights: ranked.map((entry) => sentenceCase(entry.text)),
    } satisfies WorkerResponse);
    return;
  }

  const [textVector] = await Promise.all([
    extractor(payload.text, {
      pooling: "mean",
      normalize: true,
    }),
  ]);

  const labelVectors = await Promise.all(
    payload.labels.map((label) =>
      extractor(label, {
        pooling: "mean",
        normalize: true,
      }),
    ),
  );

  const origin = Array.from(textVector.data);
  const scores = payload.labels.map((label, index) => ({
    label,
    score: cosine(origin, Array.from(labelVectors[index].data)),
  }));

  postMessage({
    id: payload.id,
    type: "classify",
    scores: scores.sort((left, right) => right.score - left.score),
  } satisfies WorkerResponse);
};

function buildSummary(parts: string[]) {
  const normalized = parts
    .map((part) => trimSentence(part))
    .filter((part) => part.length >= 28)
    .filter((part, index, collection) => collection.findIndex((candidate) => simplify(candidate) === simplify(part)) === index);

  if (normalized.length === 0) {
    return "";
  }

  const [first, second, third] = normalized;
  const topic = inferTopic(normalized.join(" "));

  if (second && third) {
    return topic
      ? `Esta clase gira en torno a ${topic}. Primero se aborda ${lowerSentenceStart(first)}, despues se profundiza en ${lowerSentenceStart(second)} y se cierra con ${lowerSentenceStart(third)}.`
      : `Esta clase presenta ${lowerSentenceStart(first)}, luego desarrolla ${lowerSentenceStart(second)} y termina con ${lowerSentenceStart(third)}.`;
  }
  if (second) {
    return topic
      ? `Esta clase se centra en ${topic}. Primero se aborda ${lowerSentenceStart(first)} y despues se profundiza en ${lowerSentenceStart(second)}.`
      : `Esta clase presenta ${lowerSentenceStart(first)} y despues profundiza en ${lowerSentenceStart(second)}.`;
  }
  return topic
    ? `Esta clase se enfoca en ${topic} y te lleva por ${lowerSentenceStart(first)}.`
    : `Esta clase presenta ${lowerSentenceStart(first)}.`;
}

function trimSentence(text: string) {
  return text.replace(/\s+/g, " ").trim().replace(/[.,;:]+$/g, "");
}

function sentenceCase(text: string) {
  const normalized = trimSentence(text);
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : normalized;
}

function lowerSentenceStart(text: string) {
  const normalized = trimSentence(text);
  return normalized ? normalized[0].toLowerCase() + normalized.slice(1) : normalized;
}

function simplify(text: string) {
  return trimSentence(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferTopic(text: string) {
  const stopwords = new Set([
    "este",
    "esta",
    "clase",
    "curso",
    "video",
    "contenido",
    "para",
    "sobre",
    "desde",
    "como",
    "cuando",
    "donde",
    "porque",
    "entre",
    "tambien",
    "primero",
    "despues",
    "introduccion",
    "intro",
    "tema",
    "parte",
    "modulo",
    "sesion",
    "leccion",
    "aprender",
  ]);
  const counts = new Map<string, number>();
  for (const token of simplify(text).split(" ")) {
    if (token.length < 4 || stopwords.has(token)) {
      continue;
    }
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  const keywords = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([keyword]) => keyword);

  if (keywords.length === 0) {
    return "";
  }

  return keywords.join(", ");
}

function cosine(left: number[], right: number[]) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}
