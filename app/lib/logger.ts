import { getErrorMessage } from "@/app/lib/errors";

type LogLevel = "info" | "warn" | "error";
type LogContext = Record<string, string | number | boolean | null | undefined>;

function log(level: LogLevel, message: string, context?: LogContext) {
  const payload = {
    level,
    message,
    ...context,
  };

  const writer = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  writer("[swappify]", JSON.stringify(payload));
}

export function logInfo(message: string, context?: LogContext) {
  log("info", message, context);
}

export function logWarn(message: string, context?: LogContext) {
  log("warn", message, context);
}

export function logError(message: string, error: unknown, context?: LogContext) {
  const extraContext: LogContext = {
    error: getErrorMessage(error),
  };

  if (error instanceof Error && error.stack) {
    extraContext.stack = error.stack;
  }

  log("error", message, {
    ...context,
    ...extraContext,
  });
}
