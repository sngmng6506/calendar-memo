export const SYSTEM_IDLE_THRESHOLD_SECONDS = 60;

export function activeSecondsForInterval(
  delta,
  previousIdleSeconds,
  currentIdleSeconds,
  threshold = SYSTEM_IDLE_THRESHOLD_SECONDS
) {
  const interval = Math.max(0, Number(delta || 0));
  const currentIdle = Math.max(0, Number(currentIdleSeconds || 0));
  const idleLimit = Math.max(0, Number(threshold || 0));
  const previousIdle = previousIdleSeconds == null || !Number.isFinite(Number(previousIdleSeconds))
    ? null
    : Math.max(0, Number(previousIdleSeconds));

  if (!interval || !idleLimit) return 0;
  if (previousIdle == null) return currentIdle < idleLimit ? interval : 0;

  const expectedWithoutInput = previousIdle + interval;
  const inputOccurred = currentIdle + 1 < expectedWithoutInput;
  if (inputOccurred) {
    if (previousIdle < idleLimit) return interval;
    return Math.min(interval, currentIdle);
  }

  return Math.max(0, Math.min(interval, idleLimit - previousIdle));
}
