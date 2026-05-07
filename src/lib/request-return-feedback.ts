export function isMissingReturnFeedbackColumnError(message?: string | null) {
  const normalized = String(message || "").toLowerCase();

  return (
    normalized.includes("return_reason") ||
    normalized.includes("return_target") ||
    normalized.includes("returned_at")
  );
}

export function omitReturnFeedbackFields<T extends Record<string, unknown>>(payload: T) {
  const { return_reason, return_target, returned_at, ...rest } = payload;
  return rest;
}
