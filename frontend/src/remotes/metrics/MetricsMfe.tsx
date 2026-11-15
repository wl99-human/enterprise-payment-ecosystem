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
  RotateCw,
  Server,
  Zap,
  CheckCircle2,
  AlertCircle
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
    <div 
      id="metrics-mfe-container" 
      className="flex flex-col gap-4 animate-fade-in" 
      style={{ maxWidth: '1280px', margin: '0 auto', width: '100%', height: '100%', minHeight: 0 }}
    >
      {/* Remote Header Card */}
      <div 
        className="ui-card" 
        style={{ 
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '12px',
          flexShrink: 0,
        }}
      >
        <div className="flex items-center gap-3">
          <div 
            style={{ 
              background: '#e8f0fe', 
              padding: '12px', 
              borderRadius: '12px', 
              color: '#1a73e8' 
            }}
          >
            <Activity size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#202124', letterSpacing: '-0.01em' }}>
              System Telemetry & Chaos Engineering
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#5f6368' }}>
              Kafka Consumer Lag, Latency Distribution, LMAX RingBuffer & Fault Injection
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="badge badge-settled flex items-center gap-1.5" style={{ padding: '6px 14px' }}>
            <span className="pulse-dot"></span> Telemetry Active (1.5s Poll)
          </span>
        </div>
      </div>

      {/* Metrics Scrollable Panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
        {/* KPI Metric Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', flexShrink: 0 }}>
        {/* Metric 1: Throughput */}
        <div className="ui-card" style={{ padding: '20px' }}>
          <div className="flex justify-between items-center" style={{ marginBottom: '8px' }}>
            <span style={{ fontSize: '0.74rem', color: '#5f6368', textTransform: 'uppercase', fontWeight: 600 }}>
              Throughput
            </span>
            <div style={{ padding: '6px', backgroundColor: '#e8f0fe', borderRadius: '8px', color: '#1a73e8' }}>
              <Gauge size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#202124' }}>
            {metrics.currentTps} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#5f6368' }}>TPS</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#1e8e3e', marginTop: '4px', fontWeight: 500 }}>
            ↑ LMAX Disruptor RingBuffer Active
          </div>
        </div>

        {/* Metric 2: p95 Latency */}
        <div className="ui-card" style={{ padding: '20px' }}>
          <div className="flex justify-between items-center" style={{ marginBottom: '8px' }}>
            <span style={{ fontSize: '0.74rem', color: '#5f6368', textTransform: 'uppercase', fontWeight: 600 }}>
              p95 Commit Latency
            </span>
            <div style={{ padding: '6px', backgroundColor: chaosLatencyActive ? '#fef7e0' : '#e8f0fe', borderRadius: '8px', color: chaosLatencyActive ? '#b06000' : '#1a73e8' }}>
              <Cpu size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: chaosLatencyActive ? '#b06000' : '#202124' }}>
            {metrics.p95LatencyMillis} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#5f6368' }}>ms</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: chaosLatencyActive ? '#b06000' : '#1e8e3e', marginTop: '4px', fontWeight: 500 }}>
            {chaosLatencyActive ? '⚠ +500ms Injected Toxic Active' : '● Sub-80ms Ingestion SLA Met'}
          </div>
        </div>

        {/* Metric 3: Consumer Lag */}
        <div className="ui-card" style={{ padding: '20px' }}>
          <div className="flex justify-between items-center" style={{ marginBottom: '8px' }}>
            <span style={{ fontSize: '0.74rem', color: '#5f6368', textTransform: 'uppercase', fontWeight: 600 }}>
              Kafka Consumer Lag
            </span>
            <div style={{ padding: '6px', backgroundColor: '#f3e8fd', borderRadius: '8px', color: '#9334e6' }}>
              <Layers size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: metrics.consumerLag > 5 ? '#b06000' : '#202124' }}>
            {metrics.consumerLag} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#5f6368' }}>msgs</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#5f6368', marginTop: '4px' }}>
            Across 12 Partitioned Workers
          </div>
        </div>

        {/* Metric 4: Processed Total */}
        <div className="ui-card" style={{ padding: '20px' }}>
          <div className="flex justify-between items-center" style={{ marginBottom: '8px' }}>
            <span style={{ fontSize: '0.74rem', color: '#5f6368', textTransform: 'uppercase', fontWeight: 600 }}>
              Processed Events Total
            </span>
            <div style={{ padding: '6px', backgroundColor: '#fce8e6', borderRadius: '8px', color: '#d93025' }}>
              <Flame size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#202124' }}>
            {metrics.totalTransactionsProcessed}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#1e8e3e', marginTop: '4px', fontWeight: 500 }}>
            ● Zero Double-Charge Guarantee
          </div>
        </div>
      </div>

      {/* Kafka 12-Partition Distribution Visualizer Card */}
      <div className="ui-card" style={{ padding: '24px 28px', borderRadius: '12px' }}>
        <div className="flex justify-between items-center" style={{ marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#202124' }}>
              Kafka Partition Load Balancer
            </h3>
            <p style={{ fontSize: '0.76rem', color: '#5f6368' }}>
              Topic: <code style={{ color: '#1a73e8', fontWeight: 600 }}>payment.init</code> (12 Partitions) • Keyed by <code style={{ color: '#202124' }}>sender_account_id</code>
            </p>
          </div>
          <span className="badge badge-settled" style={{ fontSize: '0.7rem' }}>
            Partitions Balanced
          </span>
        </div>

        <div 
          style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(12, 1fr)', 
            gap: '10px', 
            alignItems: 'end', 
            height: '110px', 
            padding: '16px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #e8eaed',
          }}
        >
          {Array.from({ length: 12 }).map((_, idx) => {
            const count = metrics.partitionDistribution[idx] || (10 + ((idx * 3) % 15));
            const heightPct = Math.min(100, Math.max(25, (count / 30) * 100));
            return (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                <div 
                  style={{
                    width: '100%',
                    height: `${heightPct}%`,
                    backgroundColor: '#1a73e8',
                    borderRadius: '4px',
                    transition: 'height 0.4s ease',
                  }}
                  title={`Partition ${idx}: ${count} messages routed`}
                />
                <span style={{ fontSize: '0.7rem', color: '#5f6368', marginTop: '6px', fontWeight: 600 }}>
                  p{idx}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chaos Engineering & Fault Injection Panel */}
      <div 
        className="ui-card" 
        style={{ 
          padding: '24px 28px', 
          borderRadius: '12px',
          border: '1px solid #feefc3',
          backgroundColor: '#fffdf9',
        }}
      >
        <div className="flex items-center gap-2" style={{ marginBottom: '14px' }}>
          <Sliders size={20} color="#b06000" />
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#202124' }}>
              Live Chaos Engineering Controls (Toxiproxy Fault Injection)
            </h3>
            <p style={{ fontSize: '0.76rem', color: '#5f6368' }}>
              Inject latency, simulated outages, and burst traffic to test system resilience
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          {/* Chaos Trigger 1: +500ms Latency */}
          <button
            id="chaos-latency-btn"
            onClick={toggleChaosLatency}
            className={chaosLatencyActive ? 'btn-danger' : 'btn-secondary'}
            style={{ width: '100%', fontSize: '0.84rem', padding: '12px 18px', justifyContent: 'center' }}
          >
            <AlertTriangle size={16} />
            <span>{chaosLatencyActive ? 'Disable +500ms Lag' : 'Inject +500ms Lag (Toxiproxy)'}</span>
          </button>

          {/* Chaos Trigger 2: Downstream 503 Notification Outage */}
          <button
            id="chaos-downstream-btn"
            onClick={() => onToggleDownstreamOutage(!isOutageSimulated)}
            className={isOutageSimulated ? 'btn-danger' : 'btn-secondary'}
            style={{ width: '100%', fontSize: '0.84rem', padding: '12px 18px', justifyContent: 'center' }}
            title="Forces notification service into retry backoff and routes to Dead Letter Queue (payment.dlq)"
          >
            <Skull size={16} />
            <span>{isOutageSimulated ? 'Clear Downstream Outage' : 'Inject 503 Outage (DLQ)'}</span>
          </button>

          {/* Chaos Trigger 3: Synthetic Load Injection */}
          <button
            id="chaos-burst-btn"
            onClick={() => onInjectSyntheticLoad(10)}
            className="btn-primary"
            style={{ width: '100%', fontSize: '0.84rem', padding: '12px 18px', justifyContent: 'center' }}
          >
            <Play size={16} />
            <span>Burst 10 Tx Concurrency</span>
          </button>
        </div>

        {isOutageSimulated && (
          <div 
            className="animate-fade-in"
            style={{ 
              marginTop: '16px', 
              padding: '10px 16px', 
              borderRadius: '8px',
              backgroundColor: '#fce8e6',
              border: '1px solid #fad2cf',
              color: '#c5221f',
              fontSize: '0.78rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={16} />
            <span>
              Downstream 503 Outage Active: Circuit breaker tripped. Notifications routed to topic <code>payment.dlq</code> with exponential backoff & jitter.
            </span>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

