import type { ArgumentsHost } from '@nestjs/common';
import { DomainExceptionFilter } from './domain-exception.filter.js';
import {
  AuditUnavailableError,
  ForbiddenError,
  UnauthenticatedError,
} from './domain-errors.js';

/*
 * The 403 path must not carry a WWW-Authenticate challenge (RFC 6750 applies
 * to 401 responses only). Checked at the filter, where the header is set.
 */
function run(error: unknown) {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  new DomainExceptionFilter().catch(error, host);
  return response;
}

describe('DomainExceptionFilter authentication responses', () => {
  it('sends the plain Bearer challenge when no token was presented', () => {
    const response = run(new UnauthenticatedError(false));
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer realm="banking-event-sourcing"',
    );
  });

  it('sends the invalid_token challenge when a token was refused', () => {
    const response = run(new UnauthenticatedError(true));
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer realm="banking-event-sourcing", error="invalid_token"',
    );
  });

  it('sends no WWW-Authenticate challenge on a 403', () => {
    const response = run(new ForbiddenError());
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('maps AUDIT_UNAVAILABLE to 503 with its stable code', () => {
    const response = run(new AuditUnavailableError());
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 503, code: 'AUDIT_UNAVAILABLE' }),
    );
  });
});
