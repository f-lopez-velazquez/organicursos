import { useEffect, useMemo, useState } from "react";
import { readLocalStorage, writeLocalStorage } from "@/lib/utils/safe-storage";

const LAUNCH_COUNT_KEY = "organicursos:launch-count";
const DISMISSED_UNTIL_KEY = "organicursos:donation-dismissed-until";

export function useSubtleDonationPrompt() {
  const [launchCount, setLaunchCount] = useState(0);
  const [dismissedUntil, setDismissedUntil] = useState<number | null>(null);

  useEffect(() => {
    const nextLaunchCount = Number(readLocalStorage(LAUNCH_COUNT_KEY) ?? "0") + 1;
    writeLocalStorage(LAUNCH_COUNT_KEY, String(nextLaunchCount));
    setLaunchCount(nextLaunchCount);

    const rawDismissedUntil = readLocalStorage(DISMISSED_UNTIL_KEY);
    setDismissedUntil(rawDismissedUntil ? Number(rawDismissedUntil) : null);
  }, []);

  const shouldShow = useMemo(() => {
    const now = Date.now();
    const waiting = dismissedUntil && dismissedUntil > now;
    if (waiting) {
      return false;
    }

    return launchCount > 0 && launchCount % 4 === 0;
  }, [dismissedUntil, launchCount]);

  const dismiss = (days = 10) => {
    const until = Date.now() + days * 24 * 60 * 60 * 1000;
    writeLocalStorage(DISMISSED_UNTIL_KEY, String(until));
    setDismissedUntil(until);
  };

  return {
    shouldShow,
    dismiss,
  };
}
