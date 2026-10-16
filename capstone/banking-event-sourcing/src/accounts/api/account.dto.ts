import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class OpenAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  ownerName: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO 4217 code' })
  currency?: string;
}

export class DepositMoneyDto {
  /** Integer minor units, e.g. 1050 = 10.50. */
  @IsInt()
  @IsPositive()
  amountMinor: number;

  /** Client-generated idempotency key; resending it is a safe no-op. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  operationId: string;
}
