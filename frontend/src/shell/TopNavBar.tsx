import React from 'react';
import { 
  Layers, 
  Search, 
  Wallet, 
  Globe, 
  CheckCircle2, 
  HelpCircle, 
  Bell, 
  ChevronDown 
} from 'lucide-react';
import { Account } from '../types';

interface TopNavBarProps {
  accounts: Record<string, Account>;
  activeAccountId: string;
  onSelectAccount: (accountId: string) => void;
  currency: string;
  onSelectCurrency: (currency: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  accounts,
  activeAccountId,
  onSelectAccount,
  currency,
  onSelectCurrency,
  searchQuery,
  onSearchChange,
}) => {
  const currentAccount = accounts[activeAccountId] || Object.values(accounts)[0];
  const currencies = ['USD', 'EUR', 'GBP', 'JPY'];

  // Initials for avatar
  const initials = currentAccount.name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header
      style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid var(--border-subtle)',
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Brand & Product Identifier */}
      <div className="flex items-center gap-3">
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            backgroundColor: '#1a73e8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 1px 3px 0 rgba(26, 115, 232, 0.4)',
          }}
        >
          <Layers size={22} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#202124', letterSpacing: '-0.02em' }}>
              AegisPay
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 600,
                color: '#1a73e8',
                backgroundColor: '#e8f0fe',
                padding: '2px 8px',
                borderRadius: '12px',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Enterprise
            </span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#5f6368', marginTop: '-2px' }}>
            Distributed Ledger & Transaction Ecosystem
          </div>
        </div>
      </div>

      {/* Center Search Box */}
      <div style={{ flex: 1, maxWidth: '540px', margin: '0 32px' }}>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#f1f3f4',
            borderRadius: '24px',
            padding: '2px 16px',
            transition: 'background-color 0.2s, box-shadow 0.2s',
          }}
        >
          <Search size={18} color="#5f6368" style={{ marginRight: '10px' }} />
          <input
            type="text"
            placeholder="Search payments, journal IDs, idempotency keys, accounts..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              padding: '8px 0',
              fontSize: '0.88rem',
              color: '#202124',
              boxShadow: 'none',
            }}
          />
        </div>
      </div>

      {/* Right Utilities: Status, Currency, & User Switcher */}
      <div className="flex items-center gap-3">
        {/* Cluster Sync Health Indicator */}
        <div
          className="badge-settled"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 12px',
            fontSize: '0.75rem',
            fontWeight: 600,
          }}
          title="Kafka Event Backbone (12 Partitions) & PostgreSQL ACID Synchronized"
        >
          <span className="pulse-dot"></span>
          <span>Cluster Synced</span>
        </div>

        {/* Currency Switcher */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#f1f3f4',
            borderRadius: '20px',
            padding: '3px 4px',
          }}
        >
          {currencies.map(curr => (
            <button
              key={curr}
              onClick={() => onSelectCurrency(curr)}
              style={{
                border: 'none',
                backgroundColor: currency === curr ? '#ffffff' : 'transparent',
                color: currency === curr ? '#1a73e8' : '#5f6368',
                boxShadow: currency === curr ? '0 1px 2px rgba(60,64,67,0.2)' : 'none',
                borderRadius: '16px',
                padding: '4px 9px',
                fontSize: '0.74rem',
                fontWeight: currency === curr ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {curr}
            </button>
          ))}
        </div>

        {/* Active Account Switcher Dropdown */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 10px 4px 6px',
            borderRadius: '24px',
            border: '1px solid #dadce0',
            backgroundColor: '#ffffff',
          }}
        >
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              backgroundColor: '#1a73e8',
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {initials}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <select
              id="active-user-select"
              value={activeAccountId}
              onChange={(e) => onSelectAccount(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#202124',
                fontSize: '0.82rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
                padding: 0,
                boxShadow: 'none',
              }}
            >
              {Object.values(accounts).map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} (${(acc.balanceMinorUnits / 100).toLocaleString()})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </header>
  );
};
