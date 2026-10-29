/**
 * Errors raised when a command breaks a business rule. They carry a stable
 * `code` so the HTTP layer can map them to status codes without parsing text.
 */
export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export type DomainErrorCode =
  | 'INVALID_AMOUNT'
  | 'INVALID_CURRENCY'
  | 'INVALID_OWNER_NAME'
  | 'ACCOUNT_NOT_FOUND'
  | 'DEPOSIT_NOT_FOUND'
  | 'WITHDRAWAL_NOT_FOUND'
  | 'OPERATION_ID_REUSED'
  | 'INSUFFICIENT_FUNDS'
  | 'CONCURRENCY_CONFLICT'
  | 'INVALID_DATE_RANGE'
  | 'INVALID_DATE'
  | 'FUTURE_DATE'
  | 'INVALID_PAGE_SIZE'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN';

export class InvalidAmountError extends DomainError {
  readonly code = 'INVALID_AMOUNT';
}

export class InvalidCurrencyError extends DomainError {
  readonly code = 'INVALID_CURRENCY';
}

export class InvalidOwnerNameError extends DomainError {
  readonly code = 'INVALID_OWNER_NAME';
}

export class AccountNotFoundError extends DomainError {
  readonly code = 'ACCOUNT_NOT_FOUND';

  constructor(accountId: string) {
    super(`Account ${accountId} does not exist`);
  }
}

/** The account exists but has no deposit with this operationId. */
export class DepositNotFoundError extends DomainError {
  readonly code = 'DEPOSIT_NOT_FOUND';

  constructor(accountId: string, operationId: string) {
    super(`Account ${accountId} has no deposit with operation ${operationId}`);
  }
}

/**
 * The account exists but has no successful withdrawal with this operationId.
 * Failed attempts are never stored, so they also land here.
 * Code name approved at gate G3.
 */
export class WithdrawalNotFoundError extends DomainError {
  readonly code = 'WITHDRAWAL_NOT_FOUND';

  constructor(accountId: string, operationId: string) {
    super(`Account ${accountId} has no withdrawal with operation ${operationId}`);
  }
}

/** The same idempotency key was sent again with a different request body. */
export class OperationIdReusedError extends DomainError {
  readonly code = 'OPERATION_ID_REUSED';

  constructor(operationId: string) {
    super(`Operation ${operationId} was already used for a different request`);
  }
}

/** The withdrawal is larger than the current balance. Nothing is written. */
export class InsufficientFundsError extends DomainError {
  readonly code = 'INSUFFICIENT_FUNDS';

  constructor(accountId: string, requestedMinor: number, balanceMinor: number) {
    super(
      `Account ${accountId} has ${balanceMinor} minor units, cannot withdraw ${requestedMinor}`,
    );
  }
}

/** Another writer appended to the stream between our load and our save. */
export class ConcurrencyConflictError extends DomainError {
  readonly code = 'CONCURRENCY_CONFLICT';

  constructor(streamId: string) {
    super(`Stream ${streamId} was modified concurrently; reload and retry`);
  }
}

/*
 * Lookup input errors. Codes and the 400 status approved at gate G3 (internal
 * handler only). The reasons come from the approved rules in date-range.ts.
 */

/** `from` is after `to`. Reported without a field because it concerns both. */
export class InvalidDateRangeError extends DomainError {
  readonly code = 'INVALID_DATE_RANGE';

  constructor() {
    super('from must not be after to');
  }
}

/** A bound is not a valid date, or is a timestamp without a timezone. */
export class InvalidDateError extends DomainError {
  readonly code = 'INVALID_DATE';

  constructor(field: 'from' | 'to', reason: 'malformed' | 'missing-timezone') {
    const detail =
      reason === 'missing-timezone' ? 'needs a timezone' : 'is malformed';
    super(`${field} ${detail}`);
  }
}

/** A bound is later than now, allowing for the configured clock tolerance. */
export class FutureDateError extends DomainError {
  readonly code = 'FUTURE_DATE';

  constructor(field: 'from' | 'to') {
    super(`${field} must not be in the future`);
  }
}

/** The page size is zero, negative, a decimal, or not a number. */
export class InvalidPageSizeError extends DomainError {
  readonly code = 'INVALID_PAGE_SIZE';

  constructor(reason: 'non-numeric' | 'non-integer' | 'non-positive') {
    super(`pageSize is ${reason}`);
  }
}

/* Authentication and authorization. Raised by AuthGuard (SEC-01, S5). */

/** No valid bearer token was presented: missing, malformed, expired or wrongly signed. */
export class UnauthenticatedError extends DomainError {
  readonly code = 'UNAUTHENTICATED';

  /** True when a token was presented but refused; false when none was presented. */
  constructor(readonly invalidToken: boolean) {
    super('Authentication required');
  }
}

/** The caller is authenticated but lacks the role this route requires. */
export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';

  constructor() {
    super('Insufficient permissions');
  }
}
