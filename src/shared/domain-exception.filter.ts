import { type ArgumentsHost, Catch, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { EventSourcingErrorCode, isEventSourcingError } from '@ocoda/event-sourcing';
import type { Response } from 'express';
import { JWT_REALM } from '../auth/jwt-options.js';
import {
  DomainError,
  type DomainErrorCode,
  UnauthenticatedError,
} from './domain-errors.js';

/* Challenges for 401 responses (RFC 6750). Only the HTTP layer knows these. */
const PLAIN_CHALLENGE = `Bearer realm="${JWT_REALM}"`;
const INVALID_TOKEN_CHALLENGE = `${PLAIN_CHALLENGE}, error="invalid_token"`;

const STATUS_BY_CODE: Record<DomainErrorCode, HttpStatus> = {
  INVALID_AMOUNT: HttpStatus.BAD_REQUEST,
  INVALID_CURRENCY: HttpStatus.BAD_REQUEST,
  INVALID_OWNER_NAME: HttpStatus.BAD_REQUEST,
  ACCOUNT_NOT_FOUND: HttpStatus.NOT_FOUND,
  DEPOSIT_NOT_FOUND: HttpStatus.NOT_FOUND,
  WITHDRAWAL_NOT_FOUND: HttpStatus.NOT_FOUND,
  OPERATION_ID_REUSED: HttpStatus.CONFLICT,
  INSUFFICIENT_FUNDS: HttpStatus.UNPROCESSABLE_ENTITY,
  CONCURRENCY_CONFLICT: HttpStatus.CONFLICT,
  INVALID_DATE_RANGE: HttpStatus.BAD_REQUEST,
  INVALID_DATE: HttpStatus.BAD_REQUEST,
  FUTURE_DATE: HttpStatus.BAD_REQUEST,
  INVALID_PAGE_SIZE: HttpStatus.BAD_REQUEST,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
};

/**
 * Maps business-rule errors (and malformed ids) to HTTP responses. Anything
 * else goes to Nest's default handling, which hides internal details.
 */
@Catch()
export class DomainExceptionFilter extends BaseExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (error instanceof DomainError) {
      if (error instanceof UnauthenticatedError) {
        response.setHeader(
          'WWW-Authenticate',
          error.invalidToken ? INVALID_TOKEN_CHALLENGE : PLAIN_CHALLENGE,
        );
      }
      const status = STATUS_BY_CODE[error.code];
      response
        .status(status)
        .json({ statusCode: status, code: error.code, message: error.message });
      return;
    }

    if (isEventSourcingError(error, EventSourcingErrorCode.InvalidId)) {
      response
        .status(HttpStatus.BAD_REQUEST)
        .json({ statusCode: 400, code: 'INVALID_ID', message: 'Invalid id' });
      return;
    }

    super.catch(error, host);
  }
}
