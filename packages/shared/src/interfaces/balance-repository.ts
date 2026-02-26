export interface BalanceRepository {
  getBalance(accountId: string): Promise<number>;
  debit(accountId: string, amount: number): Promise<void>;
  /** Atomically check balance and debit. Returns true if debited, false if insufficient. */
  tryDebit(accountId: string, amount: number): Promise<boolean>;
}
