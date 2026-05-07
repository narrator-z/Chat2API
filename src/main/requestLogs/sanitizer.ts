import type { RequestLogEntry } from '../store/types.ts'
import type { RequestLogConfig } from './types.ts'

export function sanitizeRequestLogEntry(
  entry: Omit<RequestLogEntry, 'id'>,
  config: RequestLogConfig,
): Omit<RequestLogEntry, 'id'> {
  const sanitized: Omit<RequestLogEntry, 'id'> = {
    ...entry,
    userInput: truncateText(entry.userInput, 500),
    errorStack: undefined,
  }

  if (!config.includeBodies) {
    sanitized.requestBody = undefined
    sanitized.responseBody = undefined
    sanitized.responsePreview = truncateText(entry.responsePreview, 1000)
    sanitized.errorMessage = truncateText(entry.errorMessage, 1000)
    return sanitized
  }

  sanitized.requestBody = sanitizeRequestLogBody(entry.requestBody, config)
  sanitized.responseBody = sanitizeRequestLogBody(entry.responseBody, config)
  sanitized.responsePreview = truncateText(entry.responsePreview, 1000)
  sanitized.errorMessage = truncateText(entry.errorMessage, 1000)

  return sanitized
}

export function sanitizeRequestLogUpdates(
  updates: Partial<RequestLogEntry>,
  config: RequestLogConfig,
  originalEntry?: Partial<RequestLogEntry>,
): Partial<RequestLogEntry> {
  // Only include fields that were explicitly provided in updates.
  // For fields not in updates, preserve from originalEntry if provided, otherwise undefined.
  const sanitized: Partial<RequestLogEntry> = {
    userInput: 'userInput' in updates
      ? (updates.userInput !== undefined ? truncateText(updates.userInput, 500) : undefined)
      : (originalEntry?.userInput ?? undefined),
    errorStack: undefined,
  }

  if (!config.includeBodies) {
    // Only set requestBody/responseBody if they were in updates
    if ('requestBody' in updates) {
      sanitized.requestBody = undefined
    }
    if ('responseBody' in updates) {
      sanitized.responseBody = undefined
    }
    sanitized.responsePreview = updates.responsePreview !== undefined ? truncateText(updates.responsePreview, 1000) : undefined
    sanitized.errorMessage = updates.errorMessage !== undefined ? truncateText(updates.errorMessage, 1000) : undefined
    return sanitized
  }

  // includeBodies is true - preserve existing body fields if not in updates
  if ('requestBody' in updates) {
    sanitized.requestBody = sanitizeRequestLogBody(updates.requestBody, config)
  }
  if ('responseBody' in updates) {
    sanitized.responseBody = sanitizeRequestLogBody(updates.responseBody, config)
  }
  if ('responsePreview' in updates) {
    sanitized.responsePreview = truncateText(updates.responsePreview, 1000)
  }
  if ('errorMessage' in updates) {
    sanitized.errorMessage = truncateText(updates.errorMessage, 1000)
  }

  return sanitized
}

export function trimRequestLogsToMaxEntries(
  entries: RequestLogEntry[],
  config: RequestLogConfig,
): RequestLogEntry[] {
  const maxEntries = Math.max(0, config.maxEntries)
  if (maxEntries === 0) {
    return []
  }

  if (entries.length <= maxEntries) {
    return entries
  }

  return entries.slice(entries.length - maxEntries)
}

function sanitizeRequestLogBody(value: string | undefined, config: RequestLogConfig): string | undefined {
  if (!value) return value

  const redacted = config.redactSensitiveData ? redactSensitiveText(value) : value
  return truncateText(redacted, config.maxBodyChars)
}

function truncateText(value: string | undefined, maxChars: number): string | undefined {
  if (!value) return value
  if (maxChars <= 0) return undefined
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}...[truncated ${value.length - maxChars} chars]`
}

function redactSensitiveText(value: string): string {
  return value.replace(
    /(\"?(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|cookie|set-cookie|password|token)\"?\s*[:=]\s*)\"?[^\",}\]\s]+\"?/gi,
    '$1"[REDACTED]"',
  )
}
