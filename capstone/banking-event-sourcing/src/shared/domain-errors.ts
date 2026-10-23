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
  | 'OPERATION_ID_REUSED'
  | 'INSUFFICIENT_FUNDS'
  | 'CONCURRENCY_CONFLICT';

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
