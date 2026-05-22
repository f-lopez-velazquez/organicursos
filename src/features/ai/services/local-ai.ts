import { atlasApi } from "@/lib/api/atlas-api";
import { toAppFileUrl } from "@/lib/utils/file-url";
import { buildCourseInsightDraft, buildSimilarityDrafts, CATEGORY_LABELS, DIFFICULTY_LABELS } from "./ai-insights";
import { useAppStore } from "@/store/app-store";

type WorkerResponse =
  | { id: string; type: "embed"; vectors: number[][] }
  | { id: string; type: "classify"; scores: Array<{ label: string; score: number }> }
  | { id: string; type: "summarize"; summary: string; highlights: string[] }
  | { id: string; type: "transcribe"; text: string; chunks: Array<{ start: number; end: number; text: string }> };

class LocalAiService {
  private worker: Worker | null = null;

  private pending = new Map<string, (payload: WorkerResponse) => void>();
  private syncRunning = false;
  private intelligenceRunning = false;
  private transcriptRunning = false;

  async embed(texts: string[], modelName: string) {
    const worker = this.ensureWorker();
    const id = crypto.randomUUID();
    const response = await new Promise<WorkerResponse>((resolve) => {
      this.pending.set(id, resolve);
      worker.postMessage({
        id,
        type: "embed",
        texts,
        modelName,
      });
    });

    if (response.type !== "embed") {
      throw new Error("respuesta inesperada de embeddings");
    }

    return response.vectors;
  }

  async classify(text: string, labels: string[], modelName: string) {
    const worker = this.ensureWorker();
    const id = crypto.randomUUID();
    const response = await new Promise<WorkerResponse>((resolve) => {
      this.pending.set(id, resolve);
      worker.postMessage({
        id,
        type: "classify",
        text,
        labels,
        modelName,
      });
    });

    if (response.type !== "classify") {
      throw new Error("respuesta inesperada de clasificación");
    }

    return response.scores;
  }

  async summarize(text: string, modelName: string) {
    const worker = this.ensureWorker();
    const id = crypto.randomUUID();
    const response = await new Promise<WorkerResponse>((resolve) => {
      this.pending.set(id, resolve);
      worker.postMessage({
        id,
        type: "summarize",
        text,
        modelName,
      });
    });

    if (response.type !== "summarize") {
      throw new Error("respuesta inesperada de resumen");
    }

    return response;
  }

  async transcribe(audioUrl: string, modelName: string) {
    const worker = this.ensureWorker();
    const id = crypto.randomUUID();
    const response = await new Promise<WorkerResponse>((resolve) => {
      this.pending.set(id, resolve);
      worker.postMessage({
        id,
        type: "transcribe",
        audioUrl,
        modelName,
      });
    });

    if (response.type !== "transcribe") {
      throw new Error("respuesta inesperada de transcripcion");
    }

    return response;
  }

  async syncPendingEmbeddings(modelName: string) {
    const settings = useAppStore.getState().settings;
    if (settings && (settings.aiProcessingEnabled === false || settings.lowResourceMode === true)) {
      return;
    }
    if (this.syncRunning) {
      return;
    }

    this.syncRunning = true;
    try {
      const pending = await atlasApi.listPendingEmbeddings(12);
      if (pending.length === 0) {
        return;
      }

      const vectors = await this.embed(
        pending.map((entry) => entry.text),
        modelName,
      );

      await atlasApi.storeEmbeddingBatch(
        pending.map((entry, index) => ({
          embeddingId: entry.embeddingId,
          courseId: entry.courseId,
          entityType: entry.entityType,
          modelName: entry.modelName,
          excerpt: entry.text.slice(0, 280),
          vector: vectors[index],
        })),
      );
    } finally {
      this.syncRunning = false;
    }
  }

  async syncLibraryIntelligence(modelName: string) {
    const settings = useAppStore.getState().settings;
    if (settings && (settings.aiProcessingEnabled === false || settings.lowResourceMode === true)) {
      return;
    }
    await this.syncPendingEmbeddings(modelName);

    if (this.intelligenceRunning) {
      return;
    }

    this.intelligenceRunning = true;
    try {
      const [pendingCourses, allCourses] = await Promise.all([
        atlasApi.listPendingCourseAiDocuments(24),
        atlasApi.listCourseAiDocuments(),
      ]);
      if (pendingCourses.length === 0) {
        if (allCourses.length > 1) {
          const allVectors = await this.embed(
            allCourses.map((course) => course.text),
            modelName,
          );
          await atlasApi.replaceCourseSimilarityCandidates(buildSimilarityDrafts(allCourses, allVectors));
        }
        return;
      }

      const insights = [];

      for (const course of pendingCourses) {
        const [categoryScores, difficultyScores] = await Promise.all([
          this.classify(course.text, [...CATEGORY_LABELS], modelName),
          this.classify(course.text, [...DIFFICULTY_LABELS], modelName),
        ]);

        insights.push(buildCourseInsightDraft(course, categoryScores, difficultyScores));
      }

      await atlasApi.storeCourseAiInsights(
        insights.map((insight) => ({
          ...insight,
          modelName,
        })),
      );

      if (allCourses.length > 1) {
        const allVectors = await this.embed(
          allCourses.map((course) => course.text),
          modelName,
        );
        await atlasApi.replaceCourseSimilarityCandidates(buildSimilarityDrafts(allCourses, allVectors));
      }
    } finally {
      this.intelligenceRunning = false;
    }
  }

  async syncPendingLessonTranscripts(modelName: string) {
    const settings = useAppStore.getState().settings;
    if (settings && (settings.aiProcessingEnabled === false || settings.lowResourceMode === true)) {
      return 0;
    }
    if (this.transcriptRunning) {
      return 0;
    }

    this.transcriptRunning = true;
    try {
      let processed = 0;
      for (let batch = 0; batch < 200; batch += 1) {
        const pending = await atlasApi.listPendingLessonTranscriptDocuments(6);
        if (pending.length === 0) {
          break;
        }

        for (const lesson of pending) {
          const seededText = lesson.existingText?.trim();

          if (seededText) {
            const summary = await this.summarize(seededText, modelName);
            await atlasApi.storeGeneratedLessonTranscript({
              lessonId: lesson.lessonId,
              transcriptText: seededText,
              summary: summary.summary || null,
              subtitleVtt: toWebVtt([], seededText),
              contentHash: lesson.contentHash,
            });
            processed += 1;
            continue;
          }

          const audioUrl = toAppFileUrl(lesson.absolutePath);
          if (!audioUrl) {
            continue;
          }

          const transcript = await this.transcribe(audioUrl, "Xenova/whisper-tiny");
          if (!transcript.text.trim()) {
            continue;
          }

          const summary = await this.summarize(transcript.text, modelName);
          await atlasApi.storeGeneratedLessonTranscript({
            lessonId: lesson.lessonId,
            transcriptText: transcript.text,
            summary: summary.summary || null,
            subtitleVtt: toWebVtt(transcript.chunks, transcript.text),
            contentHash: lesson.contentHash,
          });
          processed += 1;
        }
      }
      return processed;
    } finally {
      this.transcriptRunning = false;
    }
  }

  resetSessionCache() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pending.clear();
  }

  private ensureWorker() {
    const settings = useAppStore.getState().settings;
    if (settings && (settings.aiProcessingEnabled === false || settings.lowResourceMode === true)) {
      throw new Error("El procesamiento de IA local está desactivado para ahorrar recursos.");
    }

    if (this.worker) {
      return this.worker;
    }

    if (typeof Worker === "undefined") {
      throw new Error("Worker no disponible en este entorno");
    }

    this.worker = new Worker(new URL("../workers/embedding.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const handler = this.pending.get(event.data.id);
      if (!handler) {
        return;
      }
      this.pending.delete(event.data.id);
      handler(event.data);
    });
    return this.worker;
  }
}

export const localAiService = new LocalAiService();

function toWebVtt(chunks: Array<{ start: number; end: number; text: string }>, fallbackText: string) {
  if (chunks.length === 0) {
    return `WEBVTT\n\n00:00:00.000 --> 00:59:59.000\n${fallbackText.trim()}\n`;
  }

  const body = chunks
    .map((chunk, index) => {
      const start = formatTimestamp(chunk.start);
      const end = formatTimestamp(Math.max(chunk.end, chunk.start + 0.8));
      return `${index + 1}\n${start} --> ${end}\n${chunk.text.trim()}\n`;
    })
    .join("\n");

  return `WEBVTT\n\n${body}`;
}

function formatTimestamp(seconds: number) {
  const totalMs = Math.max(0, Math.floor(seconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  return [hours, minutes, secs].map((value) => String(value).padStart(2, "0")).join(":") + `.${String(millis).padStart(3, "0")}`;
}
