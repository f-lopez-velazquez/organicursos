import { readLocalStorage, writeLocalStorage } from "@/lib/utils/safe-storage";

const RESUME_KEY_PREFIX = "organicursos.lesson.resume.";

export interface LessonResumeCheckpoint {
  lessonId: number;
  currentTimeSeconds: number;
  progressPercent: number;
  completed: boolean;
  speed: number;
  volume: number;
  savedAt: string;
}

function keyForLesson(lessonId: number) {
  return `${RESUME_KEY_PREFIX}${lessonId}`;
}

export function readLessonResumeCheckpoint(lessonId: number): LessonResumeCheckpoint | null {
  const rawValue = readLocalStorage(keyForLesson(lessonId));
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as LessonResumeCheckpoint;
    if (parsed.lessonId !== lessonId) {
      return null;
    }
    if (!Number.isFinite(parsed.currentTimeSeconds) || parsed.currentTimeSeconds < 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeLessonResumeCheckpoint(checkpoint: LessonResumeCheckpoint) {
  return writeLocalStorage(keyForLesson(checkpoint.lessonId), JSON.stringify(checkpoint));
}
