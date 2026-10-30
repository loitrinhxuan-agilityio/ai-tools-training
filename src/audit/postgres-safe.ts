/*
 * PostgreSQL cannot store every string a caller can send. U+0000 is refused in
 * `text` and in `jsonb`, and a lone UTF-16 surrogate is refused in `jsonb`. A
 * write that hits either fails, and the lookup it audits would then fail with
 * 503 and leave no row, which is the worst outcome for a malformed request.
 *
 * Both are replaced by their visible escape text (`\u0000`, `\ud800`) rather
 * than dropped, so the row still shows what was sent. A genuine literal
 * `\u0000` in the input cannot be told apart from an escaped NUL; that is
 * accepted. Well-formed surrogate pairs (emoji) are left untouched.
 */
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

const escapeCodeUnit = (unit: string): string =>
  `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`;

export function safeText(value: string): string {
  return value.replaceAll('\u0000', '\\u0000').replace(LONE_SURROGATE, escapeCodeUnit);
}

export function safeNullableText(value: string | null): string | null {
  return value === null ? null : safeText(value);
}

/**
 * JSON for a `jsonb` column. Only string values are made safe: the keys come
 * from fixed constants in the lookup handlers, not from the caller.
 */
export function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'string' ? safeText(item) : item,
  );
}
