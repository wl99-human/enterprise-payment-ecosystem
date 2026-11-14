import React, { useState, useEffect } from 'react';
import { 
  Send, 
  RotateCcw, 
  WifiOff, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Zap, 
  Clock, 
  DollarSign, 
  Copy,
  Layers
} from 'lucide-react';
import { StepperStage, Account, OfflineQueuedTransaction } from '../../types';

interface CheckoutMfeProps {
  currentAccount: Account;
  onOptimisticBalanceMutation: (amountMinorUnits: number) => void;
  onRollbackBalanceMutation: (amountMinorUnits: number) => void;
  onCommitSettlement: (senderId: string, receiverId: string, amountMinorUnits: number) => void;
}

export const CheckoutMfe: React.FC<CheckoutMfeProps> = ({
  currentAccount,
  onOptimisticBalanceMutation,
  onRollbackBalanceMutation,
  onCommitSettlement
}) => {
  const [recipient, setRecipient] = useState('acc_bob');
  const [amountDollars, setAmountDollars] = useState('50.00');
  const [currency, setCurrency] = useState('USD');
  const [idempotencyKey, setIdempotencyKey] = useState(`idem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  
  const [stage, setStage] = useState<StepperStage>('IDLE');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isRollbackAnimating, setIsRollbackAnimating] = useState(false);
  const [offlineMode, setOfflineMode] = useState(!navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueuedTransaction[]>([]);
  const [lastTxId, setLastTxId] = useState<string | null>(null);

  // Load offline queue from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('aegis_offline_queue');
      if (saved) {
        setOfflineQueue(JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Failed to parse offline queue', e);
    }

    const handleOnline = () => setOfflineMode(false);
    const handleOffline = () => setOfflineMode(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const saveOfflineQueue = (newQueue: OfflineQueuedTransaction[]) => {
    setOfflineQueue(newQueue);
    localStorage.setItem('aegis_offline_queue', JSON.stringify(newQueue));
  };

  const handleAmountPreset = (val: string) => {
    setAmountDollars(val);
  };

  const generateNewIdempotencyKey = () => {
    setIdempotencyKey(`idem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  };

  // Submit transfer handler with Optimistic UI mutation & multi-stage async stepper
  const handleInitiateTransfer = async (forceSimulateFailure = false) => {
    const amountMinor = Math.round(parseFloat(amountDollars) * 100);
    if (isNaN(amountMinor) || amountMinor <= 0) {
      alert('Please enter a valid transfer amount.');
      return;
    }

    if (amountMinor > currentAccount.balanceMinorUnits) {
      alert('Insufficient funds available in account balance.');
      return;
    }

    // Offline Interceptor
    if (offlineMode) {
      const queuedItem: OfflineQueuedTransaction = {
        id: `offline_${Date.now()}`,
        payload: {
          senderAccountId: currentAccount.id,
          receiverAccountId: recipient,
          amountMinorUnits: amountMinor,
          currency,
          idempotencyKey
        },
        queuedAt: Date.now()
      };
      saveOfflineQueue([...offlineQueue, queuedItem]);
      setStatusMessage('Device offline: Transaction enqueued into Service Worker offline storage.');
      generateNewIdempotencyKey();
      return;
    }

    // 1. STEP 1: SUBMITTED + OPTIMISTIC UI MUTATION (Instant Local Balance Debit)
    setStage('SUBMITTED');
    setStatusMessage('Transaction dispatched to Ingestion Gateway...');
    onOptimisticBalanceMutation(amountMinor);

    try {
      // 2. STEP 2: INGESTED & LOCKED (Bloom Filter checked + Mutex Lock + RingBuffer)
      await new Promise(r => setTimeout(r, 600));
      setStage('INGESTED_LOCKED');
      setStatusMessage('Fast-path Bloom Filter verified. Redis Mutex lock acquired. Serialized to Protobuf.');

      // 3. STEP 3: LEDGER WRITTEN (PostgreSQL double-entry journal + Outbox staged)
      await new Promise(r => setTimeout(r, 700));
      setStage('LEDGER_WRITTEN');
      setStatusMessage('Lexicographical row lock held. Double-entry debits/credits committed to journal.');

      if (forceSimulateFailure) {
        throw new Error('Simulated Downstream Deadlock / Insufficient Invariant Rejection');
      }

      // Call API or Fallback simulation
      let txId = `tx_${Date.now().toString(36)}`;
      try {
        const response = await fetch('/api/v1/payments/transfer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Idempotency-Key': idempotencyKey,
            'X-Signature': 'mock_hmac_sha256_verified'
          },
          body: JSON.stringify({
            senderAccountId: currentAccount.id,
            receiverAccountId: recipient,
            amountMinorUnits: amountMinor,
            currency
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.transactionId) txId = data.transactionId;
        }
      } catch (err) {
        // Dev fallback: keep moving to demonstrate full stepper lifecycle
        console.debug('Direct backend call handled via reactive simulation', err);
      }

      // 4. STEP 4: SETTLED (Kafka payment.settled consumed & Outbox delivered)
      await new Promise(r => setTimeout(r, 600));
      setStage('SETTLED');
      setLastTxId(txId);
      setStatusMessage(`Transaction settled successfully! Reference: ${txId}`);
      onCommitSettlement(currentAccount.id, recipient, amountMinor);

      // Auto reset stepper after 4 seconds
      setTimeout(() => {
        setStage('IDLE');
        generateNewIdempotencyKey();
      }, 4000);

    } catch (err: any) {
      // COMPENSATING ROLLBACK: Revert optimistic state mutation with animated feedback
      console.warn('Transaction rejected, initiating compensating UI rollback', err);
      setStage('REJECTED_ROLLBACK');
      setIsRollbackAnimating(true);
      setStatusMessage(`REJECTED: ${err.message || 'Payment failure'}. Performing Compensating Balance Rollback!`);
      
      // Revert optimistic mutation
      onRollbackBalanceMutation(amountMinor);

      setTimeout(() => {
        setIsRollbackAnimating(false);
      }, 1200);

      setTimeout(() => {
        setStage('IDLE');
        generateNewIdempotencyKey();
      }, 5000);
    }
  };

  // Sync offline queue
  const handleSyncOfflineQueue = async () => {
    if (offlineQueue.length === 0) return;
    setStatusMessage(`Syncing ${offlineQueue.length} queued offline transactions...`);
    
    for (const item of offlineQueue) {
      onOptimisticBalanceMutation(item.payload.amountMinorUnits);
      await new Promise(r => setTimeout(r, 400));
      onCommitSettlement(item.payload.senderAccountId, item.payload.receiverAccountId, item.payload.amountMinorUnits);
    }

    saveOfflineQueue([]);
    setStatusMessage('All offline transactions synchronized and committed.');
  };

  const formatCurrency = (minor: number) => {
    return (minor / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  };

  return (
    <div id="checkout-mfe-container" className="glass-panel p-6 flex flex-col gap-6" style={{ padding: '24px' }}>
      {/* Remote Header */}
      <div className="flex items-center justify-between border-b pb-4" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
        <div className="flex items-center gap-3">
          <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '8px', borderRadius: 'var(--radius-md)', color: 'var(--accent-primary)' }}>
            <Zap size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: '700', letterSpacing: '-0.01em' }}>Remote 1: Checkout MFE</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Optimistic UI & Multi-Stage Async Stepper</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {offlineQueue.length > 0 && (
            <span className="badge badge-pending">
              <Clock size={12} /> {offlineQueue.length} Queued
            </span>
          )}
          <button 
            id="toggle-offline-btn"
            onClick={() => setOfflineMode(!offlineMode)}
            className="btn-secondary"
            style={{ fontSize: '0.75rem', padding: '4px 10px' }}
            title="Simulate Service Worker Offline Sync"
          >
            {offlineMode ? <WifiOff size={14} color="#f43f5e" /> : <ShieldCheck size={14} color="#10b981" />}
            {offlineMode ? 'Offline Simulated' : 'Network Online'}
          </button>
        </div>
      </div>

      {/* Account Balance Card with Rollback Animation */}
      <div 
        id="optimistic-balance-card"
        className={`glass-card p-4 ${isRollbackAnimating ? 'animate-shake' : ''}`}
        style={{ 
          padding: '16px',
          background: isRollbackAnimating ? 'rgba(244, 63, 94, 0.12)' : 'var(--bg-glass-card)',
          borderColor: isRollbackAnimating ? 'var(--accent-danger)' : 'var(--border-subtle)',
          transition: 'all 0.3s ease'
        }}
      >
        <div className="flex justify-between items-center">
          <div>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
              Active Sender Balance ({currentAccount.name})
            </span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: isRollbackAnimating ? 'var(--accent-danger)' : 'var(--text-primary)', marginTop: '4px' }}>
              {formatCurrency(currentAccount.balanceMinorUnits)}
            </div>
          </div>
          {isRollbackAnimating && (
            <div className="badge badge-dlq flex items-center gap-1">
              <RotateCcw size={12} /> Rollback Applied
            </div>
          )}
        </div>
      </div>

      {/* Transfer Form */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 500 }}>
            Recipient Account
          </label>
          <select 
            id="recipient-account-select"
            value={recipient} 
            onChange={(e) => setRecipient(e.target.value)}
            disabled={stage !== 'IDLE'}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
              outline: 'none'
            }}
          >
            <option value="acc_bob">Bob (acc_bob)</option>
            <option value="acc_alice">Alice (acc_alice)</option>
            <option value="acc_charlie">Charlie (acc_charlie)</option>
            <option value="acc_treasury">Corporate Treasury (acc_treasury)</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 500 }}>
            Amount (USD)
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>$</span>
            <input 
              id="transfer-amount-input"
              type="number"
              step="0.01"
              value={amountDollars}
              onChange={(e) => setAmountDollars(e.target.value)}
              disabled={stage !== 'IDLE'}
              style={{
                width: '100%',
                padding: '10px 14px 10px 28px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                fontWeight: 600,
                outline: 'none'
              }}
            />
          </div>
        </div>
      </div>

      {/* Preset Amounts */}
      <div className="flex items-center gap-2">
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Quick Presets:</span>
        {['25.00', '50.00', '250.00', '1000.00'].map(amt => (
          <button
            key={amt}
            type="button"
            className="btn-secondary"
            style={{ padding: '3px 10px', fontSize: '0.75rem' }}
            onClick={() => handleAmountPreset(amt)}
            disabled={stage !== 'IDLE'}
          >
            ${amt}
          </button>
        ))}
      </div>

      {/* Idempotency Key Ribbon */}
      <div className="glass-card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={16} color="var(--accent-primary)" />
          <span style={{ color: 'var(--text-muted)' }}>Idempotency-Key:</span>
          <code style={{ color: 'var(--accent-secondary)', fontWeight: 600 }}>{idempotencyKey}</code>
        </div>
        <button 
          onClick={generateNewIdempotencyKey}
          disabled={stage !== 'IDLE'}
          className="btn-secondary"
          style={{ padding: '2px 8px', fontSize: '0.7rem' }}
          title="Regenerate UUIDv4 Idempotency Key"
        >
          New Key
        </button>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          id="submit-transfer-btn"
          className="btn-primary"
          style={{ flex: 2 }}
          onClick={() => handleInitiateTransfer(false)}
          disabled={stage !== 'IDLE'}
        >
          {stage !== 'IDLE' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {stage !== 'IDLE' ? 'Processing Transaction...' : 'Submit Transfer'}
        </button>

        <button
          id="simulate-failure-btn"
          className="btn-danger"
          style={{ flex: 1, fontSize: '0.8rem' }}
          onClick={() => handleInitiateTransfer(true)}
          disabled={stage !== 'IDLE'}
          title="Simulates downstream failure to demonstrate compensating rollback animation"
        >
          <RotateCcw size={14} /> Test Rollback
        </button>

        {offlineQueue.length > 0 && (
          <button
            id="sync-offline-queue-btn"
            className="btn-secondary"
            onClick={handleSyncOfflineQueue}
            style={{ fontSize: '0.8rem' }}
          >
            Sync ({offlineQueue.length})
          </button>
        )}
      </div>

      {/* Real-Time Multi-Stage Progress Stepper */}
      <div className="glass-card" style={{ padding: '16px' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '14px', display: 'flex', justifyContent: 'space-between' }}>
          <span>Async Distributed Lifecycle Stepper</span>
          <span style={{ color: 'var(--accent-primary)' }}>{stage}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', position: 'relative' }}>
          {/* Step 1: Submitted */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              margin: '0 auto 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: stage !== 'IDLE' ? 'var(--accent-primary)' : 'var(--bg-surface-elevated)',
              color: '#ffffff',
              boxShadow: stage === 'SUBMITTED' ? 'var(--shadow-glow)' : 'none'
            }}>
              1
            </div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: stage !== 'IDLE' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              Submitted
            </div>
          </div>

          {/* Step 2: Ingested & Locked */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              margin: '0 auto 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: ['INGESTED_LOCKED', 'LEDGER_WRITTEN', 'SETTLED'].includes(stage) ? 'var(--accent-primary)' : 'var(--bg-surface-elevated)',
              color: '#ffffff',
              boxShadow: stage === 'INGESTED_LOCKED' ? 'var(--shadow-glow)' : 'none'
            }}>
              2
            </div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: ['INGESTED_LOCKED', 'LEDGER_WRITTEN', 'SETTLED'].includes(stage) ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              Ingested & Locked
            </div>
          </div>

          {/* Step 3: Ledger Written */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              margin: '0 auto 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: ['LEDGER_WRITTEN', 'SETTLED'].includes(stage) ? 'var(--accent-primary)' : 'var(--bg-surface-elevated)',
              color: '#ffffff',
              boxShadow: stage === 'LEDGER_WRITTEN' ? 'var(--shadow-glow)' : 'none'
            }}>
              3
            </div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: ['LEDGER_WRITTEN', 'SETTLED'].includes(stage) ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              Ledger Written
            </div>
          </div>

          {/* Step 4: Settled / Rollback */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              margin: '0 auto 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: stage === 'SETTLED' ? 'var(--accent-success)' : stage === 'REJECTED_ROLLBACK' ? 'var(--accent-danger)' : 'var(--bg-surface-elevated)',
              color: '#ffffff',
              boxShadow: stage === 'SETTLED' ? 'var(--shadow-success)' : stage === 'REJECTED_ROLLBACK' ? 'var(--shadow-danger)' : 'none'
            }}>
              {stage === 'SETTLED' ? <CheckCircle2 size={16} /> : stage === 'REJECTED_ROLLBACK' ? <AlertCircle size={16} /> : '4'}
            </div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: stage === 'SETTLED' ? 'var(--accent-success)' : stage === 'REJECTED_ROLLBACK' ? 'var(--accent-danger)' : 'var(--text-muted)' }}>
              {stage === 'REJECTED_ROLLBACK' ? 'Rollback' : 'Settled'}
            </div>
          </div>
        </div>

        {/* Live Stepper Status Message Banner */}
        {statusMessage && (
          <div 
            className="animate-fade-in"
            style={{ 
              marginTop: '14px', 
              padding: '8px 12px', 
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.76rem',
              background: stage === 'REJECTED_ROLLBACK' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(99, 102, 241, 0.10)',
              border: `1px solid ${stage === 'REJECTED_ROLLBACK' ? 'rgba(244, 63, 94, 0.3)' : 'rgba(99, 102, 241, 0.25)'}`,
              color: stage === 'REJECTED_ROLLBACK' ? '#fda4af' : '#c7d2fe'
            }}
          >
            {statusMessage}
          </div>
        )}
      </div>
    </div>
  );
};
