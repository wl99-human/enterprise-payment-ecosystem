import React, { useState, useEffect } from 'react';
import {
  Database,
  Play,
  Pause,
  Plus,
  ArrowRight,
  CheckCircle2,
  Clock,
  Layers,
  ShieldCheck,
  RefreshCw,
  FileJson,
  Zap,
  AlertCircle
} from 'lucide-react';
import { OutboxEventRecord } from '../../types';

function createSeedOutboxEvents(): OutboxEventRecord[] {
  const now = Date.now();
  return [
    {
      id: 'obx_84e2a910',
      aggregateType: 'PAYMENT_TRANSACTION',
      aggregateId: 'tx_outbox_9003',
      eventType: 'PAYMENT_SETTLED',
      payload: JSON.stringify(
        {
          transactionId: 'tx_outbox_9003',
          idempotencyKey: 'idem_outbox_9003',
          senderAccountId: 'acc_alice',
          receiverAccountId: 'acc_bob',
          amountMinorUnits: 12500,
          currency: 'USD',
          journalPostingIds: [1041, 1042]
        },
        null,
        2
      ),
      status: 'PUBLISHED',
      retryCount: 0,
      createdAt: new Date(now - 28_000).toISOString(),
      updatedAt: new Date(now - 27_810).toISOString(),
      relayLatencyMs: 190
    },
    {
      id: 'obx_37b9c402',
      aggregateType: 'PAYMENT_TRANSACTION',
      aggregateId: 'tx_outbox_9002',
      eventType: 'PAYMENT_SETTLED',
      payload: JSON.stringify(
        {
          transactionId: 'tx_outbox_9002',
          idempotencyKey: 'idem_outbox_9002',
          senderAccountId: 'acc_treasury',
          receiverAccountId: 'acc_charlie',
          amountMinorUnits: 45000,
          currency: 'USD',
          journalPostingIds: [1039, 1040]
        },
        null,
        2
      ),
      status: 'PUBLISHED',
      retryCount: 0,
      createdAt: new Date(now - 95_000).toISOString(),
      updatedAt: new Date(now - 94_845).toISOString(),
      relayLatencyMs: 155
    }
  ];
}

export const OutboxCdcVisualizer: React.FC = () => {
  const [events, setEvents] = useState<OutboxEventRecord[]>(() => createSeedOutboxEvents());
  const [selectedEvent, setSelectedEvent] = useState<OutboxEventRecord | null>(null);
  const [isPollerPaused, setIsPollerPaused] = useState<boolean>(false);
  const [activePipelinePulse, setActivePipelinePulse] = useState<number>(0);
  const [isSyncingBackend, setIsSyncingBackend] = useState<boolean>(false);

  const fetchBackendOutbox = async () => {
    setIsSyncingBackend(true);
    try {
      const res = await fetch('/api/v1/ledger/outbox');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.events) && data.events.length > 0) {
          const normalized: OutboxEventRecord[] = data.events.map((ev: any) => ({
            id: String(ev.id),
            aggregateType: ev.aggregateType || 'PAYMENT_TRANSACTION',
            aggregateId: ev.aggregateId,
            eventType: ev.eventType || 'PAYMENT_SETTLED',
            payload: ev.payload,
            status: ev.status || 'PUBLISHED',
            retryCount: ev.retryCount ?? 0,
            createdAt: ev.createdAt,
            updatedAt: ev.updatedAt,
            relayLatencyMs:
              ev.createdAt && ev.updatedAt
                ? Math.max(12, new Date(ev.updatedAt).getTime() - new Date(ev.createdAt).getTime())
                : 140
          }));
          setEvents(normalized);
          setSelectedEvent(prev => prev || normalized[0]);
        }
      }
    } catch {
      // Standalone simulation remains active
    } finally {
      setIsSyncingBackend(false);
    }
  };

  useEffect(() => {
    setSelectedEvent(events[0] || null);
    fetchBackendOutbox();
  }, []);

  // CDC Relay Poller Simulation (200ms fixedDelay cadence visualized smoothly)
  useEffect(() => {
    if (isPollerPaused) return;

    const poller = setInterval(() => {
      setEvents(prev => {
        const hasPending = prev.some(e => e.status === 'PENDING');
        if (!hasPending) return prev;

        setActivePipelinePulse(2);
        setTimeout(() => setActivePipelinePulse(3), 180);
        setTimeout(() => setActivePipelinePulse(0), 500);

        const nowIso = new Date().toISOString();
        const updatedList = prev.map(ev => {
          if (ev.status !== 'PENDING') return ev;
          const latency = Math.max(45, Date.now() - new Date(ev.createdAt).getTime());
          return {
            ...ev,
            status: 'PUBLISHED' as const,
            updatedAt: nowIso,
            relayLatencyMs: latency
          };
        });

        return updatedList;
      });
    }, 850);

    return () => clearInterval(poller);
  }, [isPollerPaused]);

  // Keep selectedEvent synchronized when status transitions PENDING -> PUBLISHED
  useEffect(() => {
    if (!selectedEvent) return;
    const fresh = events.find(e => e.id === selectedEvent.id);
    if (fresh && fresh.status !== selectedEvent.status) {
      setSelectedEvent(fresh);
    }
  }, [events, selectedEvent]);

  const handleStageAcidTransaction = () => {
    const accountsList = ['acc_alice', 'acc_bob', 'acc_charlie', 'acc_treasury'];
    const sender = accountsList[Math.floor(Math.random() * accountsList.length)];
    const receiver = accountsList.find(a => a !== sender) || 'acc_bob';
    const amountMinor = Math.floor(25 + Math.random() * 250) * 100;
    const txId = `tx_obx_${Date.now().toString(36)}`;
    const obxId = `obx_${Math.random().toString(36).substring(2, 10)}`;
    const nowIso = new Date().toISOString();

    const newRecord: OutboxEventRecord = {
      id: obxId,
      aggregateType: 'PAYMENT_TRANSACTION',
      aggregateId: txId,
      eventType: 'PAYMENT_SETTLED',
      payload: JSON.stringify(
        {
          transactionId: txId,
          idempotencyKey: `idem_${txId}`,
          senderAccountId: sender,
          receiverAccountId: receiver,
          amountMinorUnits: amountMinor,
          currency: 'USD',
          journalPostingIds: [Math.floor(1100 + Math.random() * 900), Math.floor(2100 + Math.random() * 900)]
        },
        null,
        2
      ),
      status: 'PENDING',
      retryCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    setActivePipelinePulse(1);
    setTimeout(() => {
      if (isPollerPaused) setActivePipelinePulse(0);
    }, 450);

    setEvents(prev => [newRecord, ...prev].slice(0, 50));
    setSelectedEvent(newRecord);
  };

  const pendingCount = events.filter(e => e.status === 'PENDING').length;
  const publishedCount = events.filter(e => e.status === 'PUBLISHED').length;
  const avgLatency =
    publishedCount === 0
      ? 0
      : Math.round(
          events
            .filter(e => e.status === 'PUBLISHED' && e.relayLatencyMs)
            .reduce((acc, cur) => acc + (cur.relayLatencyMs || 160), 0) / publishedCount
        );

  const extractPartitionKey = (payloadStr: string): string => {
    try {
      const parsed = JSON.parse(payloadStr);
      return parsed.senderAccountId || 'acc_alice';
    } catch {
      return 'sender_account_id';
    }
  };

  return (
    <div
      id="outbox-cdc-container"
      className="flex flex-col gap-3.5 animate-fade-in"
      style={{ maxWidth: '1280px', margin: '0 auto', width: '100%', height: '100%', minHeight: 0 }}
    >
      {/* Compact Pinned Header */}
      <div
        className="ui-card"
        style={{
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '12px',
          flexShrink: 0,
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            style={{
              background: '#e6f4ea',
              padding: '8px',
              borderRadius: '8px',
              color: '#1e8e3e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Database size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#202124', letterSpacing: '-0.01em', margin: 0 }}>
                Transactional Outbox &amp; CDC Relay Visualizer
              </h2>
              <span
                className={isPollerPaused ? 'badge badge-pending' : 'badge badge-settled'}
                style={{ fontSize: '0.68rem' }}
              >
                {isPollerPaused ? 'Poller Paused (Backlog Accumulating)' : 'Poller Active (200ms Cadence)'}
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#5f6368', margin: 0, marginTop: '1px' }}>
              PostgreSQL Table <code>outbox_events</code> → <code>TransactionalOutboxPoller</code> → Kafka Topic <code>payment.settled</code>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchBackendOutbox}
            className="btn-secondary"
            style={{ padding: '6px 10px', fontSize: '0.75rem' }}
            title="Sync with Ledger Outbox API"
          >
            <RefreshCw size={13} className={isSyncingBackend ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => setIsPollerPaused(!isPollerPaused)}
            className={isPollerPaused ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '6px 12px', fontSize: '0.75rem' }}
          >
            {isPollerPaused ? <Play size={13} /> : <Pause size={13} />}
            <span>{isPollerPaused ? 'Resume CDC Relay Poller' : 'Pause CDC Relay Poller'}</span>
          </button>

          <button
            onClick={handleStageAcidTransaction}
            className="btn-primary"
            style={{ padding: '6px 14px', fontSize: '0.76rem' }}
          >
            <Plus size={13} />
            <span>Stage New ACID Transaction</span>
          </button>
        </div>
      </div>

      {/* 3-Stage Dual-Write Architecture Pipeline Banner (Pinned) */}
      <div
        className="ui-card"
        style={{
          padding: '12px 18px',
          borderRadius: '12px',
          backgroundColor: '#fafbfc',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr auto 1fr',
            gap: '10px',
            alignItems: 'center',
          }}
        >
          {/* Stage 1 */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: activePipelinePulse === 1 ? '#e8f0fe' : '#ffffff',
              border: activePipelinePulse === 1 ? '1.5px solid #1a73e8' : '1px solid #dadce0',
              transition: 'all 0.25s ease',
            }}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: '2px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1a73e8' }}>
                1. PostgreSQL ACID Commit
              </span>
              <span className="badge badge-neutral" style={{ fontSize: '0.62rem' }}>
                {pendingCount} PENDING
              </span>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#5f6368' }}>
              <code>journal_entries</code> + <code>outbox_events</code> committed atomically
            </div>
          </div>

          <ArrowRight size={18} color={activePipelinePulse >= 2 ? '#1a73e8' : '#bdc1c6'} />

          {/* Stage 2 */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: activePipelinePulse === 2 ? '#fef7e0' : '#ffffff',
              border: activePipelinePulse === 2 ? '1.5px solid #f9ab00' : '1px solid #dadce0',
              transition: 'all 0.25s ease',
            }}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: '2px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#b06000' }}>
                2. TransactionalOutboxPoller
              </span>
              <span className="badge badge-neutral" style={{ fontSize: '0.62rem' }}>
                {isPollerPaused ? 'PAUSED' : '200ms CDC'}
              </span>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#5f6368' }}>
              Batch polls <code>WHERE status = PENDING</code> • Avg lag: {avgLatency}ms
            </div>
          </div>

          <ArrowRight size={18} color={activePipelinePulse === 3 ? '#1e8e3e' : '#bdc1c6'} />

          {/* Stage 3 */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: activePipelinePulse === 3 ? '#e6f4ea' : '#ffffff',
              border: activePipelinePulse === 3 ? '1.5px solid #1e8e3e' : '1px solid #dadce0',
              transition: 'all 0.25s ease',
            }}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: '2px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1e8e3e' }}>
                3. Kafka Broker Ack
              </span>
              <span className="badge badge-settled" style={{ fontSize: '0.62rem' }}>
                {publishedCount} PUBLISHED
              </span>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#5f6368' }}>
              Topic <code>payment.settled</code> replicated with at-least-once delivery
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Split Workspace */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.75fr', gap: '14px', flex: 1, minHeight: 0 }}>
        {/* Left: Scrollable Outbox Events Table */}
        <div
          className="ui-card"
          style={{
            padding: 0,
            overflow: 'hidden',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr
                  style={{
                    backgroundColor: '#f8f9fa',
                    borderBottom: '1px solid #dadce0',
                    color: '#5f6368',
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Event ID</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Aggregate ID</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>Relay Latency</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>Created At</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev, idx) => {
                  const isSelected = selectedEvent?.id === ev.id;
                  const isPending = ev.status === 'PENDING';
                  return (
                    <tr
                      key={ev.id}
                      onClick={() => setSelectedEvent(ev)}
                      style={{
                        borderBottom: '1px solid #e8eaed',
                        backgroundColor: isSelected ? '#e8f0fe' : idx % 2 === 0 ? '#ffffff' : '#fafafa',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.74rem', fontWeight: 600, color: '#202124' }}>
                        {ev.id.slice(0, 14)}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#1a73e8', fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>
                          {ev.aggregateId}
                        </div>
                        <div style={{ fontSize: '0.66rem', color: '#80868b' }}>{ev.eventType}</div>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <span
                          className={isPending ? 'badge badge-pending' : ev.status === 'PUBLISHED' ? 'badge badge-settled' : 'badge badge-dlq'}
                          style={{ fontSize: '0.66rem', padding: '2px 8px' }}
                        >
                          {isPending ? <Clock size={10} /> : <CheckCircle2 size={10} />}
                          {ev.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: isPending ? '#b06000' : '#1e8e3e', fontWeight: 600 }}>
                        {isPending ? 'Queued...' : `${ev.relayLatencyMs || 150} ms`}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: '0.72rem', color: '#5f6368', whiteSpace: 'nowrap' }}>
                        {new Date(ev.createdAt).toLocaleTimeString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Selected Outbox Event Inspector & Dual-Write Proof */}
        <div
          className="ui-card"
          style={{
            padding: '16px 18px',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            minHeight: 0,
            overflowY: 'auto',
          }}
        >
          {selectedEvent ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileJson size={16} color="#1a73e8" />
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#202124', margin: 0 }}>
                    Outbox Row Inspector
                  </h3>
                </div>
                <span
                  className={selectedEvent.status === 'PENDING' ? 'badge badge-pending' : 'badge badge-settled'}
                  style={{ fontSize: '0.68rem' }}
                >
                  {selectedEvent.status}
                </span>
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px',
                  border: '1px solid #e8eaed',
                  fontSize: '0.74rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div className="flex justify-between">
                  <span style={{ color: '#5f6368', fontWeight: 600 }}>Kafka Partition Key:</span>
                  <code style={{ color: '#1a73e8', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                    {extractPartitionKey(selectedEvent.payload)}
                  </code>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: '#5f6368', fontWeight: 600 }}>Aggregate Type:</span>
                  <span style={{ color: '#202124', fontWeight: 600 }}>{selectedEvent.aggregateType}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: '#5f6368', fontWeight: 600 }}>Retry Count:</span>
                  <span style={{ color: '#202124', fontWeight: 600 }}>{selectedEvent.retryCount}</span>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#5f6368', marginBottom: '4px' }}>
                  Serialized Event Payload:
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: '10px',
                    backgroundColor: '#202124',
                    color: '#8ab4f8',
                    borderRadius: '8px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    overflowX: 'auto',
                    maxHeight: '165px',
                  }}
                >
                  {selectedEvent.payload}
                </pre>
              </div>
            </>
          ) : (
            <div style={{ color: '#80868b', fontSize: '0.8rem', textAlign: 'center', padding: '20px' }}>
              Select an outbox event row to inspect its CDC payload.
            </div>
          )}

          {/* Dual-Write Architectural Explanation */}
          <div
            style={{
              marginTop: 'auto',
              padding: '12px',
              backgroundColor: '#e8f0fe',
              borderRadius: '8px',
              border: '1px solid #d2e3fc',
            }}
          >
            <div className="flex items-center gap-1.5" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1765cc', marginBottom: '4px' }}>
              <ShieldCheck size={14} /> Why No 2-Phase Commit (2PC)?
            </div>
            <p style={{ fontSize: '0.7rem', color: '#3c4043', margin: 0, lineHeight: 1.45 }}>
              Publishing to Kafka directly inside a DB transaction creates a classic dual-write split-brain hazard. Writing <code>journal_entries</code> and <code>outbox_events</code> in the same PostgreSQL ACID commit, then asynchronously polling via <code>TransactionalOutboxPoller</code>, guarantees zero lost events at high throughput without blocking distributed locks.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
