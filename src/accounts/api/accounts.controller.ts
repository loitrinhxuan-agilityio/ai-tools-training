import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@ocoda/event-sourcing';
import { RequireRole } from '../../auth/require-role.decorator.js';
import { INTERNAL_SUPPORT_ROLE } from '../../auth/roles.js';
import {
  DepositMoneyCommand,
  type DepositMoneyResult,
} from '../application/commands/deposit-money.command.js';
import { OpenAccountCommand } from '../application/commands/open-account.command.js';
import {
  type AccountEventDto,
  GetAccountEventHistoryQuery,
} from '../application/queries/get-account-event-history.query.js';
import {
  type DepositDetailsDto,
  GetDepositDetailsQuery,
} from '../application/queries/get-deposit-details.query.js';
import {
  type AccountStateDto,
  GetAccountStateQuery,
} from '../application/queries/get-account-state.query.js';
import {
  type WithdrawMoneyResult,
  WithdrawMoneyCommand,
} from '../application/commands/withdraw-money.command.js';
import {
  DepositLookupParams,
  DepositMoneyDto,
  OpenAccountDto,
  WithdrawMoneyDto,
} from './account.dto.js';

const DEFAULT_CURRENCY = 'EUR';

/** Thin HTTP adapter: turns requests into commands and queries. */
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  async open(@Body() body: OpenAccountDto): Promise<{ accountId: string }> {
    const accountId = await this.commandBus.execute(
      new OpenAccountCommand(body.ownerName, body.currency ?? DEFAULT_CURRENCY),
    );
    return { accountId };
  }

  @Post(':id/deposits')
  @HttpCode(200)
  deposit(
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() body: DepositMoneyDto,
  ): Promise<DepositMoneyResult> {
    return this.commandBus.execute(
      new DepositMoneyCommand(accountId, body.amountMinor, body.operationId),
    );
  }

  @Post(':id/withdrawals')
  @HttpCode(200)
  withdraw(
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() body: WithdrawMoneyDto,
  ): Promise<WithdrawMoneyResult> {
    return this.commandBus.execute(
      new WithdrawMoneyCommand(accountId, body.amountMinor, body.operationId),
    );
  }

  @Get(':id/deposits/:operationId')
  getDeposit(@Param() params: DepositLookupParams): Promise<DepositDetailsDto> {
    return this.queryBus.execute(
      new GetDepositDetailsQuery(params.id, params.operationId),
    );
  }

  @Get(':id')
  getState(
    @Param('id', ParseUUIDPipe) accountId: string,
  ): Promise<AccountStateDto> {
    return this.queryBus.execute(new GetAccountStateQuery(accountId));
  }

  @Get(':id/events')
  @RequireRole(INTERNAL_SUPPORT_ROLE)
  getEvents(
    @Param('id', ParseUUIDPipe) accountId: string,
  ): Promise<AccountEventDto[]> {
    return this.queryBus.execute(new GetAccountEventHistoryQuery(accountId));
  }
}
