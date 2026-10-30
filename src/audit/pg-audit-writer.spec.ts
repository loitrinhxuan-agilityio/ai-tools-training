import net from 'node:net';
import type pg from 'pg';
import { AuditUnavailableError } from '../shared/domain-errors.js';
import type { AuditRecord } from './audit-record.js';
import { PgAuditWriter } from './pg-audit-writer.js';

/*
 * Unit-level: no database. Port 1 refuses connections at once, so the write
 * must fail and be reported as AuditUnavailableError (W3), not a raw pg error.
 */
const UNREACHABLE = 'postgres://nobody:nothing@127.0.0.1:1/none';

const RECORD: AuditRecord = {
  occurredAt: new Date('2026-10-29T10:00:00.000Z'),
  actorType: 'support',
  actorId: 'staff-1',
  accountId: 'acc-1',
  action: 'withdrawal-lookup-by-range',
  outcome: 'success',
  reasonCode: null,
  query: { from: '2026-10-01', to: '2026-10-29', pageSize: 20 },
  caseId: 'CASE-1',
  note: null,
  resultCount: 3,
};

describe('PgAuditWriter', () => {
  let writer: PgAuditWriter;

  beforeEach(() => {
    writer = new PgAuditWriter(UNREACHABLE, 500);
  });

  afterEach(async () => {
    await writer.close();
  });

  it('reports an unreachable store as AuditUnavailableError', async () => {
    await expect(writer.write(RECORD)).rejects.toBeInstanceOf(AuditUnavailableError);
  });

  it('reports a failed table creation as a plain error at startup, not as a lookup failure', async () => {
    await expect(writer.ensureTable()).rejects.toThrow();
    await expect(writer.ensureTable()).rejects.not.toBeInstanceOf(AuditUnavailableError);
  });
});

/** A pool whose connect() takes `connectDelayMs`, with a client that records its calls. */
function fakePool(connectDelayMs: number, queryError?: Error) {
  const queries: Array<{ text: string; values: unknown[]; query_timeout: number }> = [];
  const releases: unknown[][] = [];
  const client = {
    query: vi.fn(async (query: (typeof queries)[number]) => {
      queries.push(query);
      if (queryError) throw queryError;
      return { rows: [] };
    }),
    release: vi.fn((...args: unknown[]) => {
      releases.push(args);
    }),
  };
  const pool = {
    on: vi.fn(),
    end: vi.fn(async () => undefined),
    connect: vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, connectDelayMs));
      return client;
    }),
  } as unknown as pg.Pool;
  return { pool, queries, releases };
}

describe('PgAuditWriter write deadline (one budget for acquire plus query)', () => {
  it('gives the query only what is left after the connection wait', async () => {
    const { pool, queries, releases } = fakePool(250);
    const writer = new PgAuditWriter(UNREACHABLE, 400, { pool });

    await writer.write(RECORD);

    expect(queries).toHaveLength(1);
    expect(queries[0].query_timeout).toBeGreaterThan(0);
    // 400 ms budget, 250 ms spent connecting: at most about 150 ms remain.
    expect(queries[0].query_timeout).toBeLessThanOrEqual(151);
    expect(releases).toEqual([[undefined]]);
  });

  it('sends no query and releases with an error when connecting used the whole budget', async () => {
    const { pool, queries, releases } = fakePool(450);
    const writer = new PgAuditWriter(UNREACHABLE, 400, { pool });

    await expect(writer.write(RECORD)).rejects.toBeInstanceOf(AuditUnavailableError);

    expect(queries).toHaveLength(0);
    expect(releases).toHaveLength(1);
    expect(releases[0][0]).toBeInstanceOf(Error);
  });

  it('releases a failed connection exactly once, with the error, so it is destroyed', async () => {
    const failure = new Error('Query read timeout');
    const { pool, releases } = fakePool(0, failure);
    const writer = new PgAuditWriter(UNREACHABLE, 400, { pool });

    await expect(writer.write(RECORD)).rejects.toBeInstanceOf(AuditUnavailableError);

    expect(releases).toEqual([[failure]]);
  });

  describe('against a server that accepts connections and never answers', () => {
    let server: net.Server;
    let sockets: net.Socket[];
    let url: string;

    beforeAll(async () => {
      sockets = [];
      server = net.createServer((socket) => {
        sockets.push(socket);
        socket.on('error', () => undefined);
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as net.AddressInfo;
      url = `postgres://nobody:nothing@127.0.0.1:${port}/none`;
    });

    afterAll(async () => {
      sockets.forEach((socket) => socket.destroy());
      await new Promise((resolve) => server.close(resolve));
    });

    it('fails the write at the one configured bound, not at twice that', async () => {
      const writer = new PgAuditWriter(url, 300);
      const started = performance.now();

      await expect(writer.write(RECORD)).rejects.toBeInstanceOf(AuditUnavailableError);

      expect(performance.now() - started).toBeLessThan(550);
      await writer.close();
    });

    it('holds start-up to its own budget, not to the write timeout', async () => {
      // A 1 ms write timeout would fail this at once if ensureTable still used it.
      const writer = new PgAuditWriter(url, 1, { startupTimeoutMs: 300 });
      const started = performance.now();

      const failure = await writer.ensureTable().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(Error);
      expect(failure).not.toBeInstanceOf(AuditUnavailableError);
      expect(performance.now() - started).toBeGreaterThanOrEqual(250);
      await writer.close();
    });
  });
});

describe('PgAuditWriter input handling', () => {
  it('stores text PostgreSQL would refuse as visible escape text, without failing the write', async () => {
    const { pool, queries } = fakePool(0);
    const writer = new PgAuditWriter(UNREACHABLE, 400, { pool });

    await writer.write({
      ...RECORD,
      actorId: 'staff\u0000-1',
      caseId: 'CASE\u0000',
      note: 'lone \uD800 half',
      query: { from: '\u0000' },
    });

    const values = queries[0].values;
    expect(values[2]).toBe('staff\\u0000-1');
    expect(values[8]).toBe('CASE\\u0000');
    expect(values[9]).toBe('lone \\ud800 half');
    expect(JSON.parse(values[7] as string)).toEqual({ from: '\\u0000' });
  });
});
