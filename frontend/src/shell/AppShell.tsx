import React, { useState, useEffect } from 'react';
import { Account, SettledTransaction, ActiveTab } from '../types';
import { TopNavBar } from './TopNavBar';
import { SideNavRail } from './SideNavRail';
import { DashboardOverview } from '../remotes/overview/DashboardOverview';
import { CheckoutMfe } from '../remotes/checkout/CheckoutMfe';
import { LedgerActivityMfe } from '../remotes/ledger/LedgerActivityMfe';
import { MetricsMfe } from '../remotes/metrics/MetricsMfe';
import { AccountsVaultView } from '../remotes/accounts/AccountsVaultView';
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
      const hash = window.location.hash.replace('#/', '').toUpperCase();
      if (['OVERVIEW', 'CHECKOUT', 'LEDGER', 'METRICS', 'ACCOUNTS'].includes(hash)) {
        setActiveTab(hash as ActiveTab);
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
    window.location.hash = `#/${tab.toLowerCase()}`;
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
        <SideNavRail
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />

        {/* Dynamic Page Router Container */}
        <main
          style={{
            flex: 1,
            padding: '28px 36px',
            overflowY: 'auto',
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
        </main>
      </div>

      {/* Fixed Bottom Footer */}
      <footer
        style={{
          height: '42px',
          flexShrink: 0,
          backgroundColor: '#ffffff',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 24px',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          zIndex: 30,
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
  );
};
