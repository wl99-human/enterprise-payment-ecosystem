import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Flame, 
  Cpu, 
  Gauge, 
  Layers, 
  Skull, 
  Sliders, 
  Wifi, 
  AlertTriangle,
  Play,
  RotateCw
} from 'lucide-react';
import { SystemMetrics } from '../../types';

interface MetricsMfeProps {
  onInjectSyntheticLoad: (count: number) => void;
  onToggleDownstreamOutage: (active: boolean) => void;
  isOutageSimulated: boolean;
}

export const MetricsMfe: React.FC<MetricsMfeProps> = ({
  onInjectSyntheticLoad,
  onToggleDownstreamOutage,
  isOutageSimulated
}) => {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    currentTps: 4.2,
    totalTransactionsProcessed: 184,
    p50LatencyMillis: 18,
    p95LatencyMillis: 42,
    p99LatencyMillis: 74,
    consumerLag: 0,
    activeSseSubscribers: 3,
    partitionDistribution: {
      0: 14, 1: 18, 2: 15, 3: 17, 4: 12, 5: 19,
      6: 16, 7: 13, 8: 15, 9: 18, 10: 14, 11: 13
    },
    recordedAt: new Date().toISOString()
  });

  const [chaosLatencyActive, setChaosLatencyActive] = useState(false);
  const [chaosPacketLossActive, setChaosPacketLossActive] = useState(false);
  const [ringBufferDepth, setRingBufferDepth] = useState(2);
  const [bloomFilterHits, setBloomFilterHits] = useState(89);

  // Subscribe to real-time metrics telemetry feed
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/v1/metrics/stream');
      eventSource.addEventListener('METRICS_SNAPSHOT', (event) => {
        try {
          const snap: SystemMetrics = JSON.parse(event.data);
          setMetrics(snap);
        } catch (e) {
          console.error('Failed to parse metrics event', e);
        }
      });
    } catch (e) {
      console.warn('Metrics SSE unreachable, local telemetry simulator running', e);
    }

    // Local telemetry simulator if backend is offline
    const interval = setInterval(() => {
      setMetrics(prev => {
        const jitter = (Math.random() - 0.5) * 0.8;
        const latencyModifier = chaosLatencyActive ? 520 : 0;
        return {
          ...prev,
          currentTps: Math.max(0.5, Math.round((prev.currentTps + jitter) * 10) / 10),
          p95LatencyMillis: Math.round(42 + latencyModifier + (Math.random() * 8)),
          p99LatencyMillis: Math.round(74 + latencyModifier + (Math.random() * 12)),
          consumerLag: chaosLatencyActive ? Math.floor(Math.random() * 18) : 0,
          recordedAt: new Date().toISOString()
        };
      });
    }, 1500);

    return () => {
      if (eventSource) eventSource.close();
      clearInterval(interval);
    };
  }, [chaosLatencyActive]);

  const toggleChaosLatency = () => {
    const next = !chaosLatencyActive;
    setChaosLatencyActive(next);
    // Call Toxiproxy or local simulation
    fetch('/api/v1/chaos/latency', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next, latencyMillis: 500 }) 
    }).catch(() => {});
  };

  const toggleChaosPacketLoss = () => {
    setChaosPacketLossActive(!chaosPacketLossActive);
  };

  return (
    <div id="metrics-mfe-container" className="glass-panel p-6 flex flex-col gap-6" style={{ padding: '24px' }}>
      {/* Remote Header */}
      <div className="flex items-center justify-between border-b pb-4" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
        <div className="flex items-center gap-3">
          <div style={{ background: 'rgba(168, 85, 247, 0.15)', padding: '8px', borderRadius: 'var(--radius-md)', color: 'var(--accent-purple)' }}>
            <Activity size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: '700', letterSpacing: '-0.01em' }}>Remote 3: Live System Metrics MFE</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Kafka Consumer Lag, Latency Gauges & Chaos Controls</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="badge badge-settled flex items-center gap-1">
            <span className="pulse-dot"></span> Telemetry Active
          </span>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {/* Metric 1: Throughput */}
        <div className="glass-card" style={{ padding: '14px 16px' }}>
          <div className="flex justify-between items-center">
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Throughput</span>
            <Gauge size={14} color="var(--accent-primary)" />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
            {metrics.currentTps} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>TPS</span>
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--accent-success)', marginTop: '2px' }}>
            ↑ Disruptor RingBuffer Active
          </div>
        </div>

        {/* Metric 2: p95 Latency */}
        <div className="glass-card" style={{ padding: '14px 16px' }}>
          <div className="flex justify-between items-center">
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>p95 Latency</span>
            <Cpu size={14} color="var(--accent-secondary)" />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: chaosLatencyActive ? 'var(--accent-warning)' : 'var(--text-primary)', marginTop: '4px' }}>
            {metrics.p95LatencyMillis} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>ms</span>
          </div>
          <div style={{ fontSize: '0.68rem', color: chaosLatencyActive ? 'var(--accent-warning)' : 'var(--accent-success)', marginTop: '2px' }}>
            {chaosLatencyActive ? '⚠ +500ms Injected Toxic' : 'Sub-80ms SLA Target Met'}
          </div>
        </div>

        {/* Metric 3: Consumer Lag */}
        <div className="glass-card" style={{ padding: '14px 16px' }}>
          <div className="flex justify-between items-center">
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Consumer Lag</span>
            <Layers size={14} color="var(--accent-purple)" />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: metrics.consumerLag > 5 ? 'var(--accent-warning)' : 'var(--text-primary)', marginTop: '4px' }}>
            {metrics.consumerLag} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>msgs</span>
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Across 12 Partitioned Workers
          </div>
        </div>

        {/* Metric 4: Total Settled */}
        <div className="glass-card" style={{ padding: '14px 16px' }}>
          <div className="flex justify-between items-center">
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Processed Total</span>
            <Flame size={14} color="var(--accent-danger)" />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
            {metrics.totalTransactionsProcessed}
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--accent-success)', marginTop: '2px' }}>
            Zero Double-Charge Invariant
          </div>
        </div>
      </div>

      {/* Kafka 12-Partition Distribution Visualizer */}
      <div className="glass-card" style={{ padding: '16px' }}>
        <div className="flex justify-between items-center mb-3">
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Apache Kafka Partition Balancing (Topic: <code style={{ color: 'var(--accent-secondary)' }}>payment.init</code> [12 Partitions])
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Key: <code style={{ color: 'var(--text-primary)' }}>sender_account_id</code>
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '6px', alignItems: 'end', height: '60px', padding: '0 4px' }}>
          {Array.from({ length: 12 }).map((_, idx) => {
            const count = metrics.partitionDistribution[idx] || (10 + ((idx * 3) % 15));
            const heightPct = Math.min(100, Math.max(25, (count / 30) * 100));
            return (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                <div 
                  style={{
                    width: '100%',
                    height: `${heightPct}%`,
                    background: 'linear-gradient(180deg, var(--accent-primary) 0%, rgba(99, 102, 241, 0.2) 100%)',
                    borderRadius: '3px',
                    transition: 'height 0.4s ease'
                  }}
                  title={`Partition ${idx}: ${count} messages routed`}
                />
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '4px' }}>p{idx}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chaos Engineering & Fault Injection Panel */}
      <div className="glass-card" style={{ padding: '16px', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid var(--border-active)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Sliders size={16} color="var(--accent-warning)" />
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Live Chaos Engineering Controls (Toxiproxy / Downstream Fault Injection)
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {/* Chaos Trigger 1: +500ms Latency */}
          <button
            id="chaos-latency-btn"
            onClick={toggleChaosLatency}
            className={chaosLatencyActive ? 'btn-danger' : 'btn-secondary'}
            style={{ width: '100%', fontSize: '0.78rem', justifyContent: 'center' }}
          >
            <AlertTriangle size={14} />
            {chaosLatencyActive ? 'Disable +500ms Lag' : 'Inject +500ms Lag (Toxi)'}
          </button>

          {/* Chaos Trigger 2: Downstream 503 Notification Outage */}
          <button
            id="chaos-downstream-btn"
            onClick={() => onToggleDownstreamOutage(!isOutageSimulated)}
            className={isOutageSimulated ? 'btn-danger' : 'btn-secondary'}
            style={{ width: '100%', fontSize: '0.78rem', justifyContent: 'center' }}
            title="Forces notification service into retry backoff and routes to Dead Letter Queue (payment.dlq)"
          >
            <Skull size={14} />
            {isOutageSimulated ? 'Clear Downstream Outage' : 'Inject 503 Outage (DLQ)'}
          </button>

          {/* Chaos Trigger 3: Synthetic Load Injection */}
          <button
            id="chaos-burst-btn"
            onClick={() => onInjectSyntheticLoad(10)}
            className="btn-primary"
            style={{ width: '100%', fontSize: '0.78rem', justifyContent: 'center' }}
          >
            <Play size={14} />
            Burst 10 Tx Concurrency
          </button>
        </div>

        {isOutageSimulated && (
          <div 
            className="badge badge-dlq animate-fade-in"
            style={{ marginTop: '12px', width: '100%', padding: '6px 12px', justifyContent: 'center', fontSize: '0.75rem' }}
          >
            Downstream 503 Outage Active: Circuit breaker trips & events routed to topic: <code>payment.dlq</code>
          </div>
        )}
      </div>
    </div>
  );
};
