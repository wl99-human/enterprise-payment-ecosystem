export type ActiveTab = 'OVERVIEW' | 'CHECKOUT' | 'LEDGER' | 'METRICS' | 'ACCOUNTS';

export type StepperStage = 
  | 'IDLE' 
  | 'SUBMITTED' 
  | 'INGESTED_LOCKED' 
  | 'LEDGER_WRITTEN' 
  | 'SETTLED' 
  | 'REJECTED_ROLLBACK';

export interface Account {
  id: string;
  name: string;
  currency: string;
  balanceMinorUnits: number;
}

export interface TransferPayload {
  senderAccountId: string;
  receiverAccountId: string;
  amountMinorUnits: number;
  currency: string;
  idempotencyKey: string;
  signature?: string;
}

export interface SettledTransaction {
  transactionId: string;
  idempotencyKey: string;
  senderAccountId: string;
  receiverAccountId: string;
  amountMinorUnits: number;
  currency: string;
  senderBalanceAfterMinorUnits: number;
  receiverBalanceAfterMinorUnits: number;
  journalPostingIds: number[];
  status: 'SETTLED' | 'REJECTED' | 'PENDING' | 'DLQ';
  latencyMillis?: number;
  settledAt: string;
}

export interface SystemMetrics {
  currentTps: number;
  totalTransactionsProcessed: number;
  p50LatencyMillis: number;
  p95LatencyMillis: number;
  p99LatencyMillis: number;
  consumerLag: number;
  activeSseSubscribers: number;
  partitionDistribution: Record<number, number>;
  recordedAt: string;
}

export interface OfflineQueuedTransaction {
  id: string;
  payload: TransferPayload;
  queuedAt: number;
}
