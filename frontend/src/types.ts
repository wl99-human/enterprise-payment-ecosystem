export type ActiveTab = 'OVERVIEW' | 'CHECKOUT' | 'LEDGER' | 'METRICS' | 'ACCOUNTS' | 'DLQ' | 'FX_DAG';

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

export interface PaymentDlqItem {
  transactionId: string;
  idempotencyKey: string;
  originalTopic: string;
  failureReason: string;
  retryCount: number;
  stackTraceSnippet: string;
  payload?: any;
  failedAt: string;
}

export interface FxEdgeData {
  from: string;
  to: string;
  feeRate: number;
  exchangeRate: number;
}

export interface FxSimulationResult {
  fromCurrency: string;
  toCurrency: string;
  inputAmountMinorUnits: number;
  optimalPath: string[];
  hopCount: number;
  effectiveExchangeRate: number;
  totalFeePercentage: number;
  grossOutputMinorUnits: number;
  feeAmountMinorUnits: number;
  netOutputMinorUnits: number;
  directFeePercentage: number;
  savingsBps: number;
  savingsMinorUnits: number;
}
