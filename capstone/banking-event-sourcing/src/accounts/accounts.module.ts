import { Module } from '@nestjs/common';
import { EventSourcingModule } from '@ocoda/event-sourcing';
import { AccountsController } from './api/accounts.controller.js';
import { DepositMoneyHandler } from './application/commands/deposit-money.command.js';
import { OpenAccountHandler } from './application/commands/open-account.command.js';
import { GetAccountEventHistoryHandler } from './application/queries/get-account-event-history.query.js';
import { GetAccountStateHandler } from './application/queries/get-account-state.query.js';
import { ACCOUNT_EVENTS } from './domain/account.events.js';
import { AccountRepository } from './infrastructure/account.repository.js';

@Module({
  imports: [EventSourcingModule.forFeature({ events: ACCOUNT_EVENTS })],
  controllers: [AccountsController],
  providers: [
    AccountRepository,
    OpenAccountHandler,
    DepositMoneyHandler,
    GetAccountStateHandler,
    GetAccountEventHistoryHandler,
  ],
})
export class AccountsModule {}
