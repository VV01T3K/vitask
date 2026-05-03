export function getBackendErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const withInfo = error as { info?: { errors?: Record<string, string[]> } };
    const firstError = withInfo.info?.errors
      ? Object.values(withInfo.info.errors).flat()[0]
      : undefined;

    if (firstError) {
      return firstError;
    }
  }

  return fallback;
}
