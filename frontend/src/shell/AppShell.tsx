import React, { useState, useEffect } from 'react';
import { 
  Layers, 
  ShieldCheck, 
  Cpu, 
  Wallet, 
  Globe, 
  ArrowLeftRight, 
  Activity, 
  RefreshCw,
  Server,
  Zap
} from 'lucide-react';
import { Account, SettledTransaction } from '../types';
import { CheckoutMfe } from '../remotes/checkout/CheckoutMfe';
import { LedgerActivityMfe } from '../remotes/ledger/LedgerActivityMfe';
import { MetricsMfe } from '../remotes/metrics/MetricsMfe';
import { ErrorBoundary } from './ErrorBoundary';

const INITIAL_ACCOUNTS: Record<string, Account> = {
  acc_alice: {
    id: 'acc_alice',
    name: 'Alice (Primary User)',
    currency: 'USD',
    balanceMinorUnits: 10000_00 // $10,000.00
  },
  acc_bob: {
    id: 'acc_bob',
    name: 'Bob (Merchant)',
    currency: 'USD',
    balanceMinorUnits: 5000_00 // $5,000.00
  },
  acc_charlie: {
    id: 'acc_charlie',
    name: 'Charlie (Partner)',
    currency: 'USD',
    balanceMinorUnits: 2500_00 // $2,500.00
  },
  acc_treasury: {
    id: 'acc_treasury',
    name: 'Corporate Liquidity Vault',
    currency: 'USD',
    balanceMinorUnits: 100000_00 // $100,000.00
  }
};

export const AppShell: React.FC = () => {
  const [accounts, setAccounts] = useState<Record<string, Account>>(INITIAL_ACCOUNTS);
  const [activeAccountId, setActiveAccountId] = useState('acc_alice');
  const [globalSettledTransactions, setGlobalSettledTransactions] = useState<SettledTransaction[]>([]);
  const [isOutageSimulated, setIsOutageSimulated] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'CHECKOUT' | 'LEDGER' | 'METRICS'>('OVERVIEW');

  // Optimistic Balance Mutation: Instant local debit
  const handleOptimisticBalanceMutation = (amountMinorUnits: number) => {
    setAccounts(prev => {
      const current = prev[activeAccountId];
      if (!current) return prev;
      return {
        ...prev,
        [activeAccountId]: {
          ...current,
          balanceMinorUnits: current.balanceMinorUnits - amountMinorUnits
        }
      };
    });
  };

  // Compensating Rollback: Revert balance upon failure
  const handleRollbackBalanceMutation = (amountMinorUnits: number) => {
    setAccounts(prev => {
      const current = prev[activeAccountId];
      if (!current) return prev;
      return {
        ...prev,
        [activeAccountId]: {
          ...current,
          balanceMinorUnits: current.balanceMinorUnits + amountMinorUnits
        }
      };
    });
  };

  // Commit Settlement: Update receiver balance and record journal event
  const handleCommitSettlement = (senderId: string, receiverId: string, amountMinorUnits: number) => {
    setAccounts(prev => {
      const sender = prev[senderId];
      const receiver = prev[receiverId];
      if (!sender || !receiver) return prev;
      return {
        ...prev,
        [receiverId]: {
          ...receiver,
          balanceMinorUnits: receiver.balanceMinorUnits + amountMinorUnits
        }
      };
    });

    const newTx: SettledTransaction = {
      transactionId: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      idempotencyKey: `idem_${Date.now()}`,
      senderAccountId: senderId,
      receiverAccountId: receiverId,
      amountMinorUnits,
      currency,
      senderBalanceAfterMinorUnits: accounts[senderId].balanceMinorUnits,
      receiverBalanceAfterMinorUnits: accounts[receiverId].balanceMinorUnits + amountMinorUnits,
      journalPostingIds: [Math.floor(Math.random() * 10000), Math.floor(Math.random() * 10000) + 1],
      status: isOutageSimulated ? 'DLQ' : 'SETTLED',
      latencyMillis: Math.floor(18 + Math.random() * 24),
      settledAt: new Date().toISOString()
    };

    setGlobalSettledTransactions(prev => [newTx, ...prev].slice(0, 100));
  };

  // Synthetic load injector
  const handleInjectSyntheticLoad = (count: number) => {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const randAmount = Math.floor(10 + Math.random() * 80) * 100;
        handleCommitSettlement('acc_treasury', 'acc_bob', randAmount);
      }, i * 150);
    }
  };

  const currentAccount = accounts[activeAccountId];

  return (
    <div className="min-h-screen flex flex-col" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navigation Bar & Global Shell Header */}
      <header 
        id="app-shell-header"
        className="glass-panel" 
        style={{ 
          margin: '16px 24px 0', 
          padding: '14px 24px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          borderRadius: 'var(--radius-lg)'
        }}
      >
        <div className="flex items-center gap-3">
          <div style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
            padding: '10px',
            borderRadius: 'var(--radius-md)',
            color: '#ffffff',
            boxShadow: 'var(--shadow-glow)'
          }}>
            <Layers size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff' }}>
                AegisPay
              </h1>
              <span className="badge badge-settled" style={{ fontSize: '0.65rem' }}>Production Topology</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Distributed Event-Driven Ledger & Micro-Frontend Shell
            </p>
          </div>
        </div>

        {/* Global Controls & Status */}
        <div className="flex items-center gap-4">
          {/* Active Account Switcher */}
          <div className="flex items-center gap-2 glass-card" style={{ padding: '6px 12px' }}>
            <Wallet size={16} color="var(--accent-primary)" />
            <select
              id="active-user-select"
              value={activeAccountId}
              onChange={(e) => setActiveAccountId(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: '0.84rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {Object.values(accounts).map(acc => (
                <option key={acc.id} value={acc.id} style={{ background: 'var(--bg-surface-elevated)' }}>
                  {acc.name} (${(acc.balanceMinorUnits / 100).toLocaleString()})
                </option>
              ))}
            </select>
          </div>

          {/* Currency Switcher */}
          <div className="flex items-center gap-1 glass-card" style={{ padding: '4px 8px' }}>
            <Globe size={14} color="var(--text-muted)" />
            {['USD', 'EUR', 'GBP', 'JPY'].map(curr => (
              <button
                key={curr}
                onClick={() => setCurrency(curr)}
                style={{
                  background: currency === curr ? 'var(--accent-primary)' : 'transparent',
                  color: currency === curr ? '#ffffff' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '3px 7px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {curr}
              </button>
            ))}
          </div>

          {/* Global System Topology Indicator */}
          <div className="flex items-center gap-2">
            <span className="badge badge-settled flex items-center gap-1.5" title="Kafka Cluster 12 Partitions + PostgreSQL Read Committed Active">
              <span className="pulse-dot"></span> Cluster Synced
            </span>
          </div>
        </div>
      </header>

      {/* Main Micro-Frontend Container */}
      <main style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Top Split: Remote 1 (Checkout MFE) and Remote 2 (Ledger Activity MFE) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr', gap: '24px' }}>
          {/* Remote 1: Checkout MFE */}
          <ErrorBoundary fallbackTitle="Checkout Micro-Frontend Crashed">
            <CheckoutMfe
              currentAccount={currentAccount}
              onOptimisticBalanceMutation={handleOptimisticBalanceMutation}
              onRollbackBalanceMutation={handleRollbackBalanceMutation}
              onCommitSettlement={handleCommitSettlement}
            />
          </ErrorBoundary>

          {/* Remote 2: Ledger Activity MFE */}
          <ErrorBoundary fallbackTitle="Ledger Activity Micro-Frontend Crashed">
            <LedgerActivityMfe
              currentAccount={currentAccount}
              settledTransactions={globalSettledTransactions}
            />
          </ErrorBoundary>
        </div>

        {/* Bottom Full-Width: Remote 3 (Live System Metrics & Chaos Engineering MFE) */}
        <ErrorBoundary fallbackTitle="System Metrics Micro-Frontend Crashed">
          <MetricsMfe
            onInjectSyntheticLoad={handleInjectSyntheticLoad}
            onToggleDownstreamOutage={setIsOutageSimulated}
            isOutageSimulated={isOutageSimulated}
          />
        </ErrorBoundary>
      </main>

      {/* Footer */}
      <footer 
        style={{ 
          padding: '16px 24px', 
          borderTop: '1px solid var(--border-subtle)', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          fontSize: '0.76rem', 
          color: 'var(--text-muted)' 
        }}
      >
        <div className="flex items-center gap-3">
          <span>AegisPay Distributed Architecture Blueprint</span>
          <span>•</span>
          <span>Double-Entry ACID Balance Conservation</span>
          <span>•</span>
          <span>LMAX Disruptor RingBuffer</span>
        </div>
        <div>
          Webpack 5 Module Federation Host • High-Resilience Micro-Frontends
        </div>
      </footer>
    </div>
  );
};
