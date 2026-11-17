import React, { useState, useEffect } from 'react';
import { Account, SettledTransaction, ActiveTab, PaymentDlqItem } from '../types';
import { TopNavBar } from './TopNavBar';
import { SideNavRail } from './SideNavRail';
import { DashboardOverview } from '../remotes/overview/DashboardOverview';
import { CheckoutMfe } from '../remotes/checkout/CheckoutMfe';
import { LedgerActivityMfe } from '../remotes/ledger/LedgerActivityMfe';
import { MetricsMfe } from '../remotes/metrics/MetricsMfe';
import { AccountsVaultView } from '../remotes/accounts/AccountsVaultView';
import { DlqWorkbenchView } from '../remotes/dlq/DlqWorkbenchView';
import { FxDagVisualizerView } from '../remotes/fx/FxDagVisualizerView';
import { DsaPlaygroundView } from '../remotes/playground/DsaPlaygroundView';
import { OutboxCdcVisualizer } from '../remotes/outbox/OutboxCdcVisualizer';
import { AuditStatementGeneratorView } from '../remotes/audit/AuditStatementGeneratorView';
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
  const [activeTab, setActiveTab] = useState<ActiveTab>('OVERVIEW');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Synchronize active view with browser URL hash for direct links and back/forward navigation
  useEffect(() => {
    const handleHashChange = () => {
      const rawHash = window.location.hash.replace('#/', '').toLowerCase();
      if (rawHash === 'fx-dag' || rawHash === 'fx_dag') {
        setActiveTab('FX_DAG');
      } else if (rawHash === 'dlq') {
        setActiveTab('DLQ');
      } else {
        const hash = rawHash.toUpperCase();
        if (['OVERVIEW', 'CHECKOUT', 'LEDGER', 'METRICS', 'ACCOUNTS', 'PLAYGROUND', 'OUTBOX', 'AUDIT'].includes(hash)) {
          setActiveTab(hash as ActiveTab);
        }
      }
    };

    if (window.location.hash) {
      handleHashChange();
    } else {
      window.location.hash = '#/overview';
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSelectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    if (tab === 'FX_DAG') {
      window.location.hash = '#/fx-dag';
    } else {
      window.location.hash = `#/${tab.toLowerCase()}`;
    }
  };

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
      senderBalanceAfterMinorUnits: accounts[senderId] ? accounts[senderId].balanceMinorUnits : 0,
      receiverBalanceAfterMinorUnits: accounts[receiverId] ? accounts[receiverId].balanceMinorUnits + amountMinorUnits : amountMinorUnits,
      journalPostingIds: [Math.floor(Math.random() * 10000), Math.floor(Math.random() * 10000) + 1],
      status: isOutageSimulated ? 'DLQ' : 'SETTLED',
      latencyMillis: Math.floor(18 + Math.random() * 24),
      settledAt: new Date().toISOString()
    };

    setGlobalSettledTransactions(prev => [newTx, ...prev].slice(0, 100));

    if (isOutageSimulated) {
      const dlqItem: PaymentDlqItem = {
        transactionId: newTx.transactionId,
        idempotencyKey: newTx.idempotencyKey,
        originalTopic: 'payment.settled',
        failureReason: '503 Service Unavailable: Simulated downstream gateway outage routed event to payment.dlq',
        retryCount: 3,
        stackTraceSnippet: 'CircuitBreakerOpenException: Exhausted 3 exponential backoff attempts',
        payload: newTx,
        failedAt: new Date().toISOString()
      };
      try {
        const saved = localStorage.getItem('aegis_dlq_events');
        const existing: PaymentDlqItem[] = saved ? JSON.parse(saved) : [];
        localStorage.setItem('aegis_dlq_events', JSON.stringify([dlqItem, ...existing].slice(0, 100)));
      } catch (e) {
        console.warn('Failed to persist simulated DLQ item', e);
      }
    }
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

  const currentAccount = accounts[activeAccountId] || accounts['acc_alice'];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-canvas)', overflow: 'hidden' }}>
      {/* Top Navigation Bar */}
      <TopNavBar
        accounts={accounts}
        activeAccountId={activeAccountId}
        onSelectAccount={setActiveAccountId}
        currency={currency}
        onSelectCurrency={setCurrency}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Main Layout: Side Navigation Rail + Active Page View */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Side: Side Navigation Rail (extends full-height to the bottom of the viewport) */}
        <SideNavRail
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          dlqCount={globalSettledTransactions.filter(t => t.status === 'DLQ').length}
        />

        {/* Right Side: Page Viewport + Anchored Bottom Status Footer */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <main
            style={{
              flex: 1,
              padding: '20px 28px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            {/* Page 1: Overview */}
            {activeTab === 'OVERVIEW' && (
              <ErrorBoundary fallbackTitle="Overview Dashboard Crashed">
                <DashboardOverview
                  currentAccount={currentAccount}
                  accounts={accounts}
                  settledTransactions={globalSettledTransactions}
                  onNavigateTab={handleSelectTab}
                  currency={currency}
                />
              </ErrorBoundary>
            )}

            {/* Page 2: Send Money / Checkout */}
            {activeTab === 'CHECKOUT' && (
              <ErrorBoundary fallbackTitle="Checkout Micro-Frontend Crashed">
                <CheckoutMfe
                  currentAccount={currentAccount}
                  onOptimisticBalanceMutation={handleOptimisticBalanceMutation}
                  onRollbackBalanceMutation={handleRollbackBalanceMutation}
                  onCommitSettlement={handleCommitSettlement}
                />
              </ErrorBoundary>
            )}

            {/* Page 3: Ledger & Audit Activity */}
            {activeTab === 'LEDGER' && (
              <ErrorBoundary fallbackTitle="Ledger Activity Micro-Frontend Crashed">
                <LedgerActivityMfe
                  currentAccount={currentAccount}
                  settledTransactions={globalSettledTransactions}
                />
              </ErrorBoundary>
            )}

            {/* Page 4: System Metrics & Chaos */}
            {activeTab === 'METRICS' && (
              <ErrorBoundary fallbackTitle="System Metrics Micro-Frontend Crashed">
                <MetricsMfe
                  onInjectSyntheticLoad={handleInjectSyntheticLoad}
                  onToggleDownstreamOutage={setIsOutageSimulated}
                  isOutageSimulated={isOutageSimulated}
                />
              </ErrorBoundary>
            )}

            {/* Page 5: Accounts Vault */}
            {activeTab === 'ACCOUNTS' && (
              <ErrorBoundary fallbackTitle="Accounts Vault Crashed">
                <AccountsVaultView
                  accounts={accounts}
                  activeAccountId={activeAccountId}
                  onSelectAccount={setActiveAccountId}
                  onNavigateTab={handleSelectTab}
                  currency={currency}
                />
              </ErrorBoundary>
            )}

            {/* Page 6: Multi-Hop FX Routing DAG */}
            {activeTab === 'FX_DAG' && (
              <ErrorBoundary fallbackTitle="FX Routing DAG Crashed">
                <FxDagVisualizerView />
              </ErrorBoundary>
            )}

            {/* Page 7: Dead Letter Queue (DLQ) Workbench */}
            {activeTab === 'DLQ' && (
              <ErrorBoundary fallbackTitle="DLQ Workbench Crashed">
                <DlqWorkbenchView
                  isOutageSimulated={isOutageSimulated}
                  onToggleOutage={setIsOutageSimulated}
                />
              </ErrorBoundary>
            )}

            {/* Page 8: Transactional Outbox CDC Relay Visualizer */}
            {activeTab === 'OUTBOX' && (
              <ErrorBoundary fallbackTitle="Outbox CDC Relay Crashed">
                <OutboxCdcVisualizer />
              </ErrorBoundary>
            )}

            {/* Page 9: Bloom Filter & Rate Limiter Playground */}
            {activeTab === 'PLAYGROUND' && (
              <ErrorBoundary fallbackTitle="DSA Playground Crashed">
                <DsaPlaygroundView />
              </ErrorBoundary>
            )}

            {/* Page 10: Cryptographic Double-Entry Audit Statement Generator */}
            {activeTab === 'AUDIT' && (
              <ErrorBoundary fallbackTitle="Crypto Audit Crashed">
                <AuditStatementGeneratorView
                  accounts={accounts}
                  settledTransactions={globalSettledTransactions}
                />
              </ErrorBoundary>
            )}
          </main>

          {/* Clean Status Footer (Anchored under the main content, respecting the sidebar) */}
          <footer
            style={{
              height: '38px',
              flexShrink: 0,
              backgroundColor: '#ffffff',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0 28px',
              fontSize: '0.74rem',
              color: 'var(--text-muted)',
              zIndex: 20,
            }}
          >
            <div className="flex items-center gap-3">
              <span style={{ fontWeight: 600, color: '#202124' }}>AegisPay Enterprise</span>
              <span>•</span>
              <span>ACID Double-Entry Conservation (&Sigma; Debits = &Sigma; Credits)</span>
              <span>•</span>
              <span>LMAX Disruptor RingBuffer</span>
            </div>
            <div>
              Webpack 5 Module Federation • Clean Architecture
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
};
