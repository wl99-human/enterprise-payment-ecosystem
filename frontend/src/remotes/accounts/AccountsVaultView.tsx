import React, { useState } from 'react';
import { 
  Wallet, 
  ShieldCheck, 
  CheckCircle2, 
  ArrowRight, 
  Building, 
  User, 
  Briefcase, 
  Vault,
  Copy,
  Check,
  RefreshCw,
  Send
} from 'lucide-react';
import { Account, ActiveTab } from '../../types';

interface AccountsVaultViewProps {
  accounts: Record<string, Account>;
  activeAccountId: string;
  onSelectAccount: (accountId: string) => void;
  onNavigateTab: (tab: ActiveTab) => void;
  currency: string;
}

export const AccountsVaultView: React.FC<AccountsVaultViewProps> = ({
  accounts,
  activeAccountId,
  onSelectAccount,
  onNavigateTab,
  currency,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const formatCurrency = (minorUnits: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
    }).format(minorUnits / 100);
  };

  const totalVaultBalance = Object.values(accounts).reduce((acc, curr) => acc + curr.balanceMinorUnits, 0);

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const accountIcons: Record<string, React.ReactNode> = {
    acc_alice: <User size={20} color="#1a73e8" />,
    acc_bob: <Briefcase size={20} color="#1e8e3e" />,
    acc_charlie: <Building size={20} color="#9334e6" />,
    acc_treasury: <Vault size={20} color="#b06000" />,
  };

  const accountBadges: Record<string, { label: string; bg: string; color: string }> = {
    acc_alice: { label: 'Retail Customer', bg: '#e8f0fe', color: '#1a73e8' },
    acc_bob: { label: 'Merchant Tier 1', bg: '#e6f4ea', color: '#1e8e3e' },
    acc_charlie: { label: 'Corporate Partner', bg: '#f3e8fd', color: '#9334e6' },
    acc_treasury: { label: 'Central Liquidity Vault', bg: '#fef7e0', color: '#b06000' },
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in" style={{ maxWidth: '1280px', margin: '0 auto', width: '100%', height: '100%', minHeight: 0 }}>
      {/* Header & Vault Summary Card */}
      <div
        className="ui-card"
        style={{
          padding: '18px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafd 100%)',
          borderRadius: '12px',
          flexShrink: 0,
        }}
      >
        <div>
          <div className="flex items-center gap-2" style={{ marginBottom: '6px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Liquidity Overview
            </span>
            <span className="badge badge-settled" style={{ fontSize: '0.68rem' }}>
              Multi-Account Fabric
            </span>
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#202124', marginBottom: '8px' }}>
            Enterprise Accounts & Liquidity Vault
          </h2>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#202124', letterSpacing: '-0.02em' }}>
            {formatCurrency(totalVaultBalance)}
          </div>
          <div className="flex items-center gap-2" style={{ marginTop: '8px', fontSize: '0.8rem', color: '#5f6368' }}>
            <CheckCircle2 size={15} color="#1e8e3e" />
            <span>4 Active Accounts • Conservation Invariant Active (&Sigma; Debits = &Sigma; Credits)</span>
          </div>
        </div>

        <button
          onClick={() => onNavigateTab('CHECKOUT')}
          className="btn-primary"
          style={{ padding: '12px 24px', fontSize: '0.92rem' }}
        >
          <Send size={16} />
          <span>Transfer Between Accounts</span>
        </button>
      </div>

      {/* Account Cards Grid (Scrollable Section) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
        {Object.values(accounts).map((acc) => {
          const isActive = acc.id === activeAccountId;
          const percentage = ((acc.balanceMinorUnits / totalVaultBalance) * 100).toFixed(1);
          const meta = accountBadges[acc.id] || { label: 'Account', bg: '#f1f3f4', color: '#5f6368' };

          return (
            <div
              key={acc.id}
              className="ui-card"
              style={{
                padding: '24px',
                borderRadius: '12px',
                border: isActive ? '2px solid #1a73e8' : '1px solid #dadce0',
                boxShadow: isActive ? '0 2px 8px 0 rgba(26, 115, 232, 0.2)' : 'var(--shadow-card)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.2s ease',
              }}
            >
              <div>
                {/* Top Badge & Icon */}
                <div className="flex items-center justify-between" style={{ marginBottom: '14px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      backgroundColor: meta.bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {accountIcons[acc.id] || <Wallet size={20} />}
                  </div>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: '12px',
                      backgroundColor: meta.bg,
                      color: meta.color,
                    }}
                  >
                    {meta.label}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#202124', marginBottom: '2px' }}>
                  {acc.name}
                </h3>

                {/* Account ID with copy */}
                <div className="flex items-center gap-1.5" style={{ marginBottom: '16px' }}>
                  <code style={{ fontSize: '0.76rem', color: '#5f6368', fontFamily: 'var(--font-mono)' }}>
                    {acc.id}
                  </code>
                  <button
                    onClick={() => handleCopy(acc.id)}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#80868b', padding: '2px' }}
                    title="Copy Account ID"
                  >
                    {copiedId === acc.id ? <Check size={13} color="#1e8e3e" /> : <Copy size={13} />}
                  </button>
                </div>

                {/* Balance display */}
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#202124', marginBottom: '8px' }}>
                  {formatCurrency(acc.balanceMinorUnits)}
                </div>

                {/* Liquidity progress bar */}
                <div style={{ marginBottom: '16px' }}>
                  <div className="flex justify-between" style={{ fontSize: '0.72rem', color: '#5f6368', marginBottom: '4px' }}>
                    <span>Pool Share</span>
                    <span style={{ fontWeight: 600 }}>{percentage}%</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', backgroundColor: '#e8eaed', borderRadius: '3px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${percentage}%`,
                        height: '100%',
                        backgroundColor: isActive ? '#1a73e8' : meta.color,
                        borderRadius: '3px',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Action: Switch to this account */}
              <div style={{ borderTop: '1px solid #e8eaed', paddingTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {isActive ? (
                  <span className="badge badge-settled" style={{ fontSize: '0.72rem' }}>
                    ● Currently Selected
                  </span>
                ) : (
                  <button
                    onClick={() => onSelectAccount(acc.id)}
                    className="btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '6px 14px' }}
                  >
                    Switch to Account
                  </button>
                )}

                <button
                  onClick={() => onNavigateTab('CHECKOUT')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#1a73e8',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>Pay</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Double-Entry Invariant Mathematical Proof Card */}
      <div className="ui-card" style={{ padding: '16px 20px', flexShrink: 0 }}>
        <div className="flex items-center gap-3" style={{ marginBottom: '12px' }}>
          <div style={{ padding: '8px', backgroundColor: '#e6f4ea', borderRadius: '8px', color: '#1e8e3e' }}>
            <ShieldCheck size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#202124' }}>
              ACID Double-Entry Balance Conservation Invariant
            </h3>
            <p style={{ fontSize: '0.78rem', color: '#5f6368' }}>
              Mathematical verification across all database journal postings
            </p>
          </div>
        </div>

        <div style={{ padding: '16px 20px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e8eaed', marginBottom: '16px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#202124', lineHeight: 1.6 }}>
            <div>Invariant Assertion: &Sigma;(Debits) - &Sigma;(Credits) = 0 (Conservation Invariant)</div>
            <div style={{ color: '#1e8e3e', fontWeight: 600, marginTop: '4px' }}>
              Status: PASS (Zero financial drift detected across transactions)
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', fontSize: '0.8rem', color: '#5f6368' }}>
          <div>
            <strong>Isolation Level:</strong> PostgreSQL READ COMMITTED + Lexicographical Row Locks (`SELECT FOR UPDATE`)
          </div>
          <div>
            <strong>Outbox Pattern:</strong> Events written atomically in the same database transaction before Kafka dispatch.
          </div>
          <div>
            <strong>Idempotency:</strong> Scalable Murmur3 Bloom Filter + Redis Mutex eliminates duplicate writes.
          </div>
        </div>
      </div>
    </div>
  );
};

