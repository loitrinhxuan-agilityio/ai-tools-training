import { safeJson, safeNullableText, safeText } from './postgres-safe.js';

describe('safeText', () => {
  it('returns clean text unchanged', () => {
    expect(safeText('CASE-42 customer call')).toBe('CASE-42 customer call');
  });

  it('keeps a well-formed surrogate pair', () => {
    expect(safeText('paid 💸 ok')).toBe('paid 💸 ok');
  });

  it('writes a NUL as visible escape text', () => {
    expect(safeText('a\u0000b')).toBe('a\\u0000b');
    expect(safeText('\u0000\u0000')).toBe('\\u0000\\u0000');
  });

  it('writes a lone high surrogate as visible escape text', () => {
    expect(safeText('x\uD800y')).toBe('x\\ud800y');
  });

  it('writes a lone low surrogate as visible escape text', () => {
    expect(safeText('x\uDC00y')).toBe('x\\udc00y');
  });

  it('escapes a stray half but keeps a real pair next to it', () => {
    expect(safeText('\uD83D💸')).toBe('\\ud83d💸');
  });

  it('never leaves a character PostgreSQL would refuse', () => {
    const hostile = 'a\u0000b\uD800c\uDFFFd\uD83D';
    const cleaned = safeText(hostile);
    expect(cleaned.includes('\u0000')).toBe(false);
    // encodeURIComponent throws a URIError on a lone surrogate.
    expect(() => encodeURIComponent(cleaned)).not.toThrow();
  });
});

describe('safeNullableText', () => {
  it('passes null through', () => {
    expect(safeNullableText(null)).toBeNull();
  });

  it('makes a string safe', () => {
    expect(safeNullableText('n\u0000')).toBe('n\\u0000');
  });
});

describe('safeJson', () => {
  it('serializes ordinary values like JSON.stringify', () => {
    const query = { from: '2026-10-01', pageSize: 20, beforeVersion: null, tags: ['a', 'b'] };
    expect(safeJson(query)).toBe(JSON.stringify(query));
  });

  it('makes strings safe at any depth, including in arrays', () => {
    const json = safeJson({ from: '\u0000', nested: { to: 'x\uD800' }, list: ['\uDC00'] });
    expect(JSON.parse(json)).toEqual({
      from: '\\u0000',
      nested: { to: 'x\\ud800' },
      list: ['\\udc00'],
    });
  });

  it('leaves no escape that jsonb refuses', () => {
    const json = safeJson({ from: '\u0000', to: '\uD800' });
    // JSON.stringify writes a raw NUL as \u0000 and a lone surrogate as \ud800.
    // After escaping, both appear only as an escaped backslash followed by text.
    expect(json).not.toMatch(/(?<!\\)\\u0000/);
    expect(json).not.toMatch(/(?<!\\)\\ud800/i);
  });

  it('does not touch numbers, booleans or null', () => {
    expect(JSON.parse(safeJson({ a: 1, b: true, c: null }))).toEqual({ a: 1, b: true, c: null });
  });
});
