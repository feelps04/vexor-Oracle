export interface IdempotencyResult {
  authorized: boolean;
  status?: string;
}

export interface IdempotencyRepository {
  tryAcquire(key: string): Promise<boolean>;
  complete(key: string, result: IdempotencyResult): Promise<void>;
}
