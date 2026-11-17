import React, { useState, useEffect } from 'react';
import {
  Cpu,
  ShieldCheck,
  Zap,
  RotateCcw,
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Flame,
  Code2,
  ChevronDown,
  ChevronUp,
  Clock
} from 'lucide-react';

const BIT_ARRAY_SIZE = 64;
const NUM_HASHES = 4;
const WINDOW_MS = 10_000;

const REDIS_LUA_SCRIPT = `local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local clearBefore = now - window
redis.call('ZREMRANGEBYSCORE', key, 0, clearBefore)
local currentRequests = redis.call('ZCARD', key)
if currentRequests < limit then
    redis.call('ZADD', key, now, now)
    return 1
else
    return 0
end`;

function rotl32(x: number, r: number): number {
  return (x << r) | (x >>> (32 - r));
}

function murmur3_32(data: Uint8Array, seed: number): number {
  const c1 = 0xcc9e2d51 | 0;
  const c2 = 0x1b873593 | 0;
  let h1 = seed | 0;
  const len = data.length;
  const roundedEnd = len & ~0x3;

  for (let i = 0; i < roundedEnd; i += 4) {
    let k1 =
      (data[i] & 0xff) |
      ((data[i + 1] & 0xff) << 8) |
      ((data[i + 2] & 0xff) << 16) |
      ((data[i + 3] << 24) | 0);
    k1 = Math.imul(k1, c1);
    k1 = rotl32(k1, 15);
    k1 = Math.imul(k1, c2);

    h1 ^= k1;
    h1 = rotl32(h1, 13);
    h1 = (Math.imul(h1, 5) + 0xe6546b64) | 0;
  }

  let k1 = 0;
  const tail = len & 0x03;
  if (tail === 3) {
    k1 = (data[roundedEnd + 2] & 0xff) << 16;
  }
  if (tail >= 2) {
    k1 |= (data[roundedEnd + 1] & 0xff) << 8;
  }
  if (tail >= 1) {
    k1 |= data[roundedEnd] & 0xff;
    k1 = Math.imul(k1, c1);
    k1 = rotl32(k1, 15);
    k1 = Math.imul(k1, c2);
    h1 ^= k1;
  }

  h1 ^= len;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;

  return h1 | 0;
}

function computeBloomIndices(key: string, k = NUM_HASHES, m = BIT_ARRAY_SIZE): number[] {
  if (!key) return [];
  const bytes = new TextEncoder().encode(key);
  const hash1 = murmur3_32(bytes, 0x9747b28c | 0);
  let hash2 = murmur3_32(bytes, 0x1b873593 | 0);
  if (hash2 === 0) hash2 = 1;

  const indices: number[] = [];
  for (let i = 0; i < k; i++) {
    const combined = (BigInt(hash1) + BigInt(i) * BigInt(hash2)) & 0x7ffffffffffffffn;
    indices.push(Number(combined % BigInt(m)));
  }
  return indices;
}

export const DsaPlaygroundView: React.FC = () => {
  // Bloom filter state
  const [keyInput, setKeyInput] = useState('idem_tx_1001');
  const [bitArray, setBitArray] = useState<boolean[]>(() => Array(BIT_ARRAY_SIZE).fill(false));
  const [insertedKeys, setInsertedKeys] = useState<string[]>([]);
  const [highlightedIndices, setHighlightedIndices] = useState<number[]>(() => computeBloomIndices('idem_tx_1001'));
  const [bloomCheckResult, setBloomCheckResult] = useState<{
    checkedKey: string;
    mightContain: boolean;
    indices: number[];
    action: 'CHECK' | 'INSERT' | 'RESET';
  } | null>(null);

  // Rate limiter state
  const [maxLimit, setMaxLimit] = useState<number>(10);
  const [windowTimestamps, setWindowTimestamps] = useState<number[]>([]);
  const [lastHttpResult, setLastHttpResult] = useState<{
    status: 200 | 429;
    allowed: number;
    throttled: number;
    retryAfterSec: number;
    timestamp: string;
  } | null>(null);
  const [showLuaScript, setShowLuaScript] = useState(false);

  // Auto-prune timestamps older than 10s every 250ms
  useEffect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - WINDOW_MS;
      setWindowTimestamps(prev => {
        const filtered = prev.filter(ts => ts > cutoff);
        return filtered.length === prev.length ? prev : filtered;
      });
    }, 250);
    return () => clearInterval(timer);
  }, []);

  // Recompute preview hash indices when typing
  useEffect(() => {
    setHighlightedIndices(computeBloomIndices(keyInput.trim()));
  }, [keyInput]);

  const handleTestMembership = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;

    let indices = computeBloomIndices(trimmed);
    let currentBits = bitArray;
    let mightContain = indices.length > 0 && indices.every(idx => currentBits[idx]);

    try {
      const res = await fetch(`/api/v1/playground/bloom/check?key=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.hashIndices)) indices = data.hashIndices;
        if (Array.isArray(data.bitArray)) {
          currentBits = data.bitArray;
          setBitArray(data.bitArray);
        }
        if (typeof data.mightContain === 'boolean') mightContain = data.mightContain;
      }
    } catch {
      // Fallback handled seamlessly by deterministic in-browser MurmurHash3
    }

    setHighlightedIndices(indices);
    setBloomCheckResult({
      checkedKey: trimmed,
      mightContain,
      indices,
      action: 'CHECK'
    });
  };

  const handleInsertKey = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;

    let indices = computeBloomIndices(trimmed);
    const nextBits = [...bitArray];
    indices.forEach(idx => {
      nextBits[idx] = true;
    });

    try {
      const res = await fetch(`/api/v1/playground/bloom/insert?key=${encodeURIComponent(trimmed)}`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.hashIndices)) indices = data.hashIndices;
        if (Array.isArray(data.bitArray)) {
          setBitArray(data.bitArray);
        } else {
          setBitArray(nextBits);
        }
      } else {
        setBitArray(nextBits);
      }
    } catch {
      setBitArray(nextBits);
    }

    setInsertedKeys(prev => (prev.includes(trimmed) ? prev : [trimmed, ...prev]));
    setHighlightedIndices(indices);
    setBloomCheckResult({
      checkedKey: trimmed,
      mightContain: true,
      indices,
      action: 'INSERT'
    });
  };

  const handleResetBloom = async () => {
    try {
      await fetch('/api/v1/playground/bloom/reset', { method: 'POST' });
    } catch {
      // Local reset proceeds
    }
    setBitArray(Array(BIT_ARRAY_SIZE).fill(false));
    setInsertedKeys([]);
    setBloomCheckResult({
      checkedKey: '',
      mightContain: false,
      indices: [],
      action: 'RESET'
    });
  };

  const handleSendRateLimitBurst = async (burstCount: number) => {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    const active = windowTimestamps.filter(ts => ts > cutoff);

    let allowed = 0;
    let throttled = 0;
    const nextTimestamps = [...active];

    for (let i = 0; i < burstCount; i++) {
      if (nextTimestamps.length < maxLimit) {
        nextTimestamps.push(now + i * 0.001);
        allowed++;
      } else {
        throttled++;
      }
    }

    try {
      await fetch(
        `/api/v1/playground/ratelimit/test?clientKey=merchant_api_01&burstCount=${burstCount}&maxLimit=${maxLimit}&windowMillis=${WINDOW_MS}`,
        { method: 'POST' }
      );
    } catch {
      // Local sliding window state mirrors backend algorithm cleanly
    }

    setWindowTimestamps(nextTimestamps);

    const oldest = nextTimestamps[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));

    setLastHttpResult({
      status: throttled > 0 ? 429 : 200,
      allowed,
      throttled,
      retryAfterSec,
      timestamp: new Date(now).toLocaleTimeString()
    });
  };

  const handleClearWindow = () => {
    setWindowTimestamps([]);
    setLastHttpResult(null);
  };

  const elementCount = insertedKeys.length;
  const activeBitCount = bitArray.filter(Boolean).length;
  const falsePositiveProb =
    elementCount === 0
      ? 0
      : Math.pow(1 - Math.exp((-NUM_HASHES * elementCount) / BIT_ARRAY_SIZE), NUM_HASHES);

  const occupancyPct = Math.min(100, Math.round((windowTimestamps.length / maxLimit) * 100));

  return (
    <div
      id="dsa-playground-container"
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
              background: '#e8f0fe',
              padding: '8px',
              borderRadius: '8px',
              color: '#1a73e8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Cpu size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#202124', letterSpacing: '-0.01em', margin: 0 }}>
                Bloom Filter &amp; Rate Limiter Playground
              </h2>
              <span className="badge badge-settled" style={{ fontSize: '0.68rem' }}>
                O(k) Fast-Path DSA
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#5f6368', margin: 0, marginTop: '1px' }}>
              MurmurHash3 Probabilistic Idempotency Filter (m=64, k=4) &amp; Sliding Window ZSET Rate Limiter
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="badge badge-neutral" style={{ fontSize: '0.72rem', padding: '4px 10px' }}>
            {activeBitCount}/{BIT_ARRAY_SIZE} Bits Set
          </span>
          <span
            className={windowTimestamps.length >= maxLimit ? 'badge badge-dlq' : 'badge badge-settled'}
            style={{ fontSize: '0.72rem', padding: '4px 10px' }}
          >
            Window: {windowTimestamps.length}/{maxLimit} req/10s
          </span>
        </div>
      </div>

      {/* Main 2-Column Scrollable Workspace */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
          gap: '14px',
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          paddingRight: '2px',
        }}
      >
        {/* Left Column: Scalable Bloom Filter Bit-Array Visualizer */}
        <div className="ui-card flex flex-col gap-3" style={{ padding: '16px 20px', borderRadius: '12px' }}>
          <div className="flex items-center justify-between">
            <div>
              <h3 style={{ fontSize: '0.94rem', fontWeight: 700, color: '#202124', margin: 0 }}>
                Scalable Bloom Filter Bit-Array (MurmurHash3)
              </h3>
              <p style={{ fontSize: '0.72rem', color: '#5f6368', margin: 0, marginTop: '2px' }}>
                Zero False Negatives: if any hashed bit is 0, key is guaranteed new (bypasses DB)
              </p>
            </div>
            <button
              onClick={handleResetBloom}
              className="btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.72rem' }}
              title="Clear all 64 bits"
            >
              <RotateCcw size={12} /> Reset BitSet
            </button>
          </div>

          {/* Key Input + Actions */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Enter Idempotency-Key..."
              style={{
                flex: 1,
                padding: '7px 12px',
                borderRadius: '8px',
                border: '1px solid #dadce0',
                fontSize: '0.82rem',
                fontFamily: 'var(--font-mono)',
                color: '#202124',
                outline: 'none',
              }}
            />
            <button
              onClick={handleTestMembership}
              className="btn-secondary"
              style={{ padding: '7px 12px', fontSize: '0.76rem' }}
            >
              <Search size={13} /> Test (mightContain)
            </button>
            <button
              onClick={handleInsertKey}
              className="btn-primary"
              style={{ padding: '7px 12px', fontSize: '0.76rem' }}
            >
              <Plus size={13} /> Insert (put)
            </button>
          </div>

          {/* Preset Key Chips */}
          <div className="flex items-center gap-1.5" style={{ flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: '#5f6368', fontWeight: 500 }}>Presets:</span>
            {['idem_tx_1001', 'idem_tx_2048', 'idem_replay_attack_99'].map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => setKeyInput(preset)}
                className="btn-secondary"
                style={{
                  padding: '2px 9px',
                  fontSize: '0.7rem',
                  fontFamily: 'var(--font-mono)',
                  borderColor: keyInput === preset ? '#1a73e8' : '#dadce0',
                  color: keyInput === preset ? '#1a73e8' : '#5f6368',
                  backgroundColor: keyInput === preset ? '#e8f0fe' : '#ffffff',
                }}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Metrics Summary Bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '8px',
              padding: '8px 10px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #e8eaed',
            }}
          >
            <div>
              <div style={{ fontSize: '0.66rem', color: '#5f6368', fontWeight: 600 }}>Size (m)</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#202124' }}>{BIT_ARRAY_SIZE} bits</div>
            </div>
            <div>
              <div style={{ fontSize: '0.66rem', color: '#5f6368', fontWeight: 600 }}>Hashes (k)</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#202124' }}>{NUM_HASHES}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.66rem', color: '#5f6368', fontWeight: 600 }}>Inserted (n)</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1a73e8' }}>{elementCount}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.66rem', color: '#5f6368', fontWeight: 600 }}>P(FP) Rate</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: falsePositiveProb > 0.15 ? '#b06000' : '#1e8e3e' }}>
                {(falsePositiveProb * 100).toFixed(2)}%
              </div>
            </div>
          </div>

          {/* 64-Cell Visual Bit Array Grid (16x4) */}
          <div>
            <div className="flex justify-between items-center" style={{ marginBottom: '6px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#202124' }}>
                64-Bit Backing Array (g_i(x) = (h1 + i·h2) mod 64)
              </span>
              <span style={{ fontSize: '0.7rem', color: '#5f6368', fontFamily: 'var(--font-mono)' }}>
                Indices: [{highlightedIndices.join(', ')}]
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(16, 1fr)',
                gap: '4px',
                padding: '10px',
                backgroundColor: '#fafbfc',
                borderRadius: '8px',
                border: '1px solid #e8eaed',
              }}
            >
              {bitArray.map((isSet, idx) => {
                const hashNum = highlightedIndices.indexOf(idx);
                const isHashed = hashNum !== -1;

                return (
                  <div
                    key={idx}
                    title={`Bit ${idx}: ${isSet ? '1' : '0'}${isHashed ? ` (h${hashNum + 1})` : ''}`}
                    style={{
                      height: '30px',
                      borderRadius: '5px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSet ? '#1a73e8' : '#ffffff',
                      color: isSet ? '#ffffff' : '#80868b',
                      border: isHashed
                        ? isSet
                          ? '2px solid #1e8e3e'
                          : '2px solid #f9ab00'
                        : '1px solid #dadce0',
                      boxShadow: isHashed
                        ? isSet
                          ? '0 0 0 2px rgba(30, 142, 62, 0.2)'
                          : '0 0 0 2px rgba(249, 171, 0, 0.25)'
                        : 'none',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      lineHeight: 1,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <span>{isSet ? '1' : '0'}</span>
                    <span style={{ fontSize: '0.54rem', opacity: isSet ? 0.85 : 0.7 }}>{idx}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Check / Insert Outcome Banner */}
          {bloomCheckResult && bloomCheckResult.action !== 'RESET' && (
            <div
              className="animate-fade-in"
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                fontSize: '0.76rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: bloomCheckResult.mightContain ? '#fef7e0' : '#e6f4ea',
                border: `1px solid ${bloomCheckResult.mightContain ? '#feefc3' : '#ceead6'}`,
                color: bloomCheckResult.mightContain ? '#b06000' : '#137333',
              }}
            >
              {bloomCheckResult.mightContain ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
              <span>
                {bloomCheckResult.action === 'INSERT'
                  ? `INSERTED "${bloomCheckResult.checkedKey}" → Flipped bits [${bloomCheckResult.indices.join(', ')}] to 1`
                  : bloomCheckResult.mightContain
                    ? `MIGHT CONTAIN "${bloomCheckResult.checkedKey}" — All 4 bits are 1 → Check Redis Cache / DB`
                    : `DEFINITIVELY NEW KEY "${bloomCheckResult.checkedKey}" — Fast-Path Bypass DB`}
              </span>
            </div>
          )}

          {insertedKeys.length > 0 && (
            <div style={{ fontSize: '0.7rem', color: '#5f6368' }}>
              <span style={{ fontWeight: 600 }}>Inserted Keys ({insertedKeys.length}): </span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{insertedKeys.slice(0, 6).join(', ')}</span>
              {insertedKeys.length > 6 && ` (+${insertedKeys.length - 6} more)`}
            </div>
          )}
        </div>

        {/* Right Column: Sliding Window Rate Limiter Playground */}
        <div className="ui-card flex flex-col gap-3" style={{ padding: '16px 20px', borderRadius: '12px' }}>
          <div className="flex items-center justify-between">
            <div>
              <h3 style={{ fontSize: '0.94rem', fontWeight: 700, color: '#202124', margin: 0 }}>
                Sliding Window Rate Limiter (Redis ZSET)
              </h3>
              <p style={{ fontSize: '0.72rem', color: '#5f6368', margin: 0, marginTop: '2px' }}>
                Eliminates fixed-window boundary spikes via rolling 10,000ms timestamp purging
              </p>
            </div>
            <button
              onClick={handleClearWindow}
              className="btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.72rem' }}
            >
              <RotateCcw size={12} /> Clear Window
            </button>
          </div>

          {/* Threshold Slider */}
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #e8eaed',
            }}
          >
            <div className="flex justify-between items-center" style={{ marginBottom: '6px' }}>
              <span className="flex items-center gap-1.5" style={{ fontSize: '0.76rem', fontWeight: 600, color: '#202124' }}>
                <Sliders size={13} color="#1a73e8" /> Max Requests / 10s Window:
              </span>
              <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#1a73e8', fontFamily: 'var(--font-mono)' }}>
                {maxLimit} req/10s
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={50}
              step={1}
              value={maxLimit}
              onChange={(e) => setMaxLimit(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#1a73e8', cursor: 'pointer' }}
            />
            <div className="flex justify-between" style={{ fontSize: '0.66rem', color: '#80868b' }}>
              <span>5 req (Strict)</span>
              <span>25 req</span>
              <span>50 req (Burst)</span>
            </div>
          </div>

          {/* Action Burst Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <button
              onClick={() => handleSendRateLimitBurst(1)}
              className="btn-secondary"
              style={{ padding: '8px 10px', fontSize: '0.75rem', justifyContent: 'center' }}
            >
              <Zap size={13} color="#1a73e8" /> Send 1 Req
            </button>
            <button
              onClick={() => handleSendRateLimitBurst(5)}
              className="btn-primary"
              style={{ padding: '8px 10px', fontSize: '0.75rem', justifyContent: 'center' }}
            >
              <Zap size={13} /> Burst 5 Reqs
            </button>
            <button
              onClick={() => handleSendRateLimitBurst(15)}
              className="btn-danger"
              style={{ padding: '8px 10px', fontSize: '0.75rem', justifyContent: 'center' }}
            >
              <Flame size={13} /> Flood 15 (429)
            </button>
          </div>

          {/* Rolling Window Occupancy Gauge */}
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #dadce0',
            }}
          >
            <div className="flex justify-between items-center" style={{ marginBottom: '6px' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#202124' }}>
                Active Sliding Window Occupancy
              </span>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: occupancyPct >= 100 ? '#d93025' : '#1a73e8' }}>
                {windowTimestamps.length} / {maxLimit} ({occupancyPct}%)
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: '10px',
                backgroundColor: '#f1f3f4',
                borderRadius: '6px',
                overflow: 'hidden',
                marginBottom: '10px',
              }}
            >
              <div
                style={{
                  width: `${occupancyPct}%`,
                  height: '100%',
                  backgroundColor: occupancyPct >= 100 ? '#d93025' : occupancyPct >= 75 ? '#f9ab00' : '#1e8e3e',
                  transition: 'width 0.2s ease, background-color 0.2s ease',
                }}
              />
            </div>

            {/* Live ZSET Timestamp Pills */}
            <div style={{ fontSize: '0.68rem', color: '#5f6368', fontWeight: 600, marginBottom: '4px' }}>
              Live ZSET Entries (auto-expires after 10s):
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px',
                minHeight: '44px',
                maxHeight: '78px',
                overflowY: 'auto',
                padding: '6px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                border: '1px solid #e8eaed',
              }}
            >
              {windowTimestamps.length === 0 ? (
                <span style={{ fontSize: '0.7rem', color: '#80868b', margin: 'auto' }}>
                  Window empty — send requests to populate Redis ZSET scores
                </span>
              ) : (
                windowTimestamps.map((ts, idx) => {
                  const ageSec = ((Date.now() - ts) / 1000).toFixed(1);
                  return (
                    <span
                      key={`${ts}-${idx}`}
                      className="badge badge-neutral"
                      style={{ fontSize: '0.64rem', padding: '1px 6px', fontFamily: 'var(--font-mono)' }}
                    >
                      <Clock size={9} /> -{ageSec}s
                    </span>
                  );
                })
              )}
            </div>
          </div>

          {/* Live HTTP Response Status Card */}
          {lastHttpResult && (
            <div
              className="animate-fade-in"
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: lastHttpResult.status === 429 ? '#fce8e6' : '#e6f4ea',
                border: `1px solid ${lastHttpResult.status === 429 ? '#fad2cf' : '#ceead6'}`,
                color: lastHttpResult.status === 429 ? '#c5221f' : '#137333',
              }}
            >
              <div className="flex justify-between items-center" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                <span>
                  {lastHttpResult.status === 429
                    ? 'HTTP 429 Too Many Requests — Rate Limit Exceeded'
                    : 'HTTP 200 OK — Request Permitted'}
                </span>
                <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }}>
                  {lastHttpResult.timestamp}
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', marginTop: '3px' }}>
                Allowed: <strong>{lastHttpResult.allowed}</strong> • Throttled: <strong>{lastHttpResult.throttled}</strong>
                {lastHttpResult.status === 429 && (
                  <span>
                    {' '}• Header: <code>Retry-After: {lastHttpResult.retryAfterSec}s</code>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Collapsible Atomic Redis Lua Script */}
          <div style={{ borderTop: '1px solid #e8eaed', paddingTop: '8px' }}>
            <button
              onClick={() => setShowLuaScript(!showLuaScript)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '4px 0',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#1a73e8',
              }}
            >
              <span className="flex items-center gap-1.5">
                <Code2 size={14} /> Atomic Redis Lua Script (ZREMRANGEBYSCORE + ZCARD)
              </span>
              {showLuaScript ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showLuaScript && (
              <pre
                style={{
                  marginTop: '6px',
                  padding: '10px',
                  backgroundColor: '#202124',
                  color: '#8ab4f8',
                  borderRadius: '6px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  overflowX: 'auto',
                  margin: '6px 0 0 0',
                }}
              >
                {REDIS_LUA_SCRIPT}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
