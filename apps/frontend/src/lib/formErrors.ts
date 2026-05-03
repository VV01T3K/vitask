export function getFieldErrorMessages(errors: unknown[]): string[] {
  return [...new Set(flattenFieldErrors(errors))];
}

function flattenFieldErrors(errors: unknown[]): string[] {
  return errors.flatMap((error) => {
    if (!error) return [];
    if (Array.isArray(error)) return flattenFieldErrors(error);
    if (typeof error === "string") return [error];
    if (typeof error === "object" && "message" in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string") return [message];
    }
    return ["Invalid value"];
  });
}
