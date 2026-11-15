import React from 'react';
import { 
  LayoutDashboard, 
  Send, 
  ReceiptText, 
  Activity, 
  Wallet, 
  ChevronLeft, 
  ChevronRight,
  ShieldCheck,
  Server
} from 'lucide-react';
import { ActiveTab } from '../types';

interface SideNavRailProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  queuedCount?: number;
}

export const SideNavRail: React.FC<SideNavRailProps> = ({
  activeTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  queuedCount = 0,
}) => {
  const navItems = [
    {
      id: 'OVERVIEW' as ActiveTab,
      label: 'Overview',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'CHECKOUT' as ActiveTab,
      label: 'Send Money',
      icon: Send,
      badge: queuedCount > 0 ? `${queuedCount} queued` : null,
    },
    {
      id: 'LEDGER' as ActiveTab,
      label: 'Ledger & Audit',
      icon: ReceiptText,
      badge: 'Live',
    },
    {
      id: 'METRICS' as ActiveTab,
      label: 'Telemetry & Chaos',
      icon: Activity,
      badge: null,
    },
    {
      id: 'ACCOUNTS' as ActiveTab,
      label: 'Accounts Vault',
      icon: Wallet,
      badge: null,
    },
  ];

  return (
    <aside
      style={{
        width: isCollapsed ? '72px' : '240px',
        backgroundColor: '#ffffff',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '16px 8px',
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        height: 'calc(100vh - 64px)',
        position: 'sticky',
        top: '64px',
        flexShrink: 0,
      }}
    >
      {/* Navigation Links */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={`nav-pill ${isActive ? 'active' : ''}`}
              style={{
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                padding: isCollapsed ? '12px 0' : '10px 16px',
                position: 'relative',
              }}
            >
              <Icon size={20} color={isActive ? '#1a73e8' : '#5f6368'} />
              
              {!isCollapsed && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
                  <span>{item.label}</span>
                  {item.badge && (
                    <span
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '10px',
                        backgroundColor: item.badge === 'Live' ? '#e6f4ea' : '#feefc3',
                        color: item.badge === 'Live' ? '#1e8e3e' : '#b06000',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              )}

              {/* Dot badge on collapsed mode */}
              {isCollapsed && item.badge && (
                <span
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '18px',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: item.badge === 'Live' ? '#1e8e3e' : '#f9ab00',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Rail Controls & Collapser */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-divider)', paddingTop: '12px' }}>
        {!isCollapsed && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              fontSize: '0.72rem',
              color: '#5f6368',
              lineHeight: 1.4,
            }}
          >
            <div className="flex items-center gap-1.5" style={{ fontWeight: 600, color: '#202124', marginBottom: '2px' }}>
              <Server size={12} color="#1a73e8" />
              <span>Fabric Specs</span>
            </div>
            <div>Postgres ACID Outbox</div>
            <div>Kafka 12 Partitions</div>
            <div>LMAX RingBuffer Queue</div>
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className="nav-pill"
          style={{
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            padding: isCollapsed ? '10px 0' : '8px 16px',
            color: '#5f6368',
          }}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!isCollapsed && <span style={{ fontSize: '0.82rem' }}>Collapse</span>}
        </button>
      </div>
    </aside>
  );
};
