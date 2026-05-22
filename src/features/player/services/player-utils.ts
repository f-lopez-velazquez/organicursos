export function formatPlaybackTime(totalSeconds: number | null | undefined) {
  if (!totalSeconds || totalSeconds <= 0) {
    return "00:00";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function computeCompleted(
  currentTimeSeconds: number,
  durationSeconds: number,
  thresholdPercent: number,
) {
  if (durationSeconds <= 0) {
    return false;
  }

  return currentTimeSeconds / durationSeconds >= thresholdPercent / 100;
}

export function formatPercent(value: number | null | undefined, maximumFractionDigits = 0) {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(safe);
}

export function getProgressStage(value: number | null | undefined) {
  const safe = Number.isFinite(value) ? Number(value) : 0;

  if (safe >= 100) {
    return "Terminado";
  }

  if (safe >= 75) {
    return "Casi listo";
  }

  if (safe >= 35) {
    return "En marcha";
  }

  if (safe > 0) {
    return "Primeros pasos";
  }

  return "Por empezar";
}

export function getProgressMessage(value: number | null | undefined) {
  const safe = Number.isFinite(value) ? Number(value) : 0;

  if (safe >= 100) {
    return "Ya puedes darlo por completado.";
  }

  if (safe >= 75) {
    return "Te falta muy poco para cerrarlo.";
  }

  if (safe >= 35) {
    return "Ya traes buen ritmo.";
  }

  if (safe > 0) {
    return "Ya empezaste, sigue desde ahi.";
  }

  return "Todavia no lo has empezado.";
}
