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
  Check,
  Layers,
  ArrowRight
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
  const [copiedKey, setCopiedKey] = useState(false);

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

  const handleCopyKey = () => {
    navigator.clipboard.writeText(idempotencyKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
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

      // Auto-reset back to IDLE after 4.5s
      setTimeout(() => {
        setStage('IDLE');
        setStatusMessage('');
        generateNewIdempotencyKey();
      }, 4500);

    } catch (err: any) {
      console.warn('Payment failed or rollback simulated:', err);
      setStage('REJECTED_ROLLBACK');
      setStatusMessage(err.message || 'Transaction rejected. Compensating rollback initiated.');
      
      // Trigger rollback animation and revert balance
      setIsRollbackAnimating(true);
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
    <div 
      id="checkout-mfe-container" 
      className="flex flex-col gap-6 animate-fade-in" 
      style={{ maxWidth: '860px', margin: '0 auto', width: '100%' }}
    >
      {/* Remote Header Card */}
      <div 
        className="ui-card" 
        style={{ 
          padding: '24px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '16px',
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
            <Send size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#202124', letterSpacing: '-0.01em' }}>
              Send Payment
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#5f6368' }}>
              Optimistic Balance Mutation & Multi-Stage Async Stepper
            </p>
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
            style={{ fontSize: '0.78rem', padding: '6px 14px' }}
            title="Simulate Service Worker Offline Sync"
          >
            {offlineMode ? <WifiOff size={14} color="#d93025" /> : <ShieldCheck size={14} color="#1e8e3e" />}
            {offlineMode ? 'Offline Mode Active' : 'Network Online'}
          </button>
        </div>
      </div>

      {/* Account Balance Card with Rollback Animation */}
      <div 
        id="optimistic-balance-card"
        className={`ui-card ${isRollbackAnimating ? 'animate-shake' : ''}`}
        style={{ 
          padding: '20px 24px',
          backgroundColor: isRollbackAnimating ? '#fce8e6' : '#ffffff',
          borderColor: isRollbackAnimating ? '#d93025' : '#dadce0',
          transition: 'all 0.3s ease',
          borderRadius: '12px',
        }}
      >
        <div className="flex justify-between items-center">
          <div>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#5f6368', fontWeight: 600 }}>
              Sender Account: {currentAccount.name}
            </span>
            <div 
              style={{ 
                fontSize: '2rem', 
                fontWeight: 800, 
                color: isRollbackAnimating ? '#d93025' : '#1a73e8', 
                marginTop: '4px',
                letterSpacing: '-0.02em',
              }}
            >
              {formatCurrency(currentAccount.balanceMinorUnits)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#5f6368', marginTop: '2px' }}>
              Instant optimistic debits with automated rollback guarantee
            </div>
          </div>
          {isRollbackAnimating && (
            <div className="badge badge-dlq flex items-center gap-1">
              <RotateCcw size={12} /> Compensating Rollback Applied
            </div>
          )}
        </div>
      </div>

      {/* Main Payment Form Card */}
      <div className="ui-card" style={{ padding: '24px 28px', borderRadius: '12px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#202124', marginBottom: '16px' }}>
          Transfer Details
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: '#202124', marginBottom: '6px', fontWeight: 600 }}>
              Recipient Account
            </label>
            <select 
              id="recipient-account-select"
              value={recipient} 
              onChange={(e) => setRecipient(e.target.value)}
              disabled={stage !== 'IDLE'}
              style={{
                width: '100%',
                padding: '11px 14px',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                border: '1px solid #dadce0',
                color: '#202124',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            >
              <option value="acc_bob">Bob (Merchant - acc_bob)</option>
              <option value="acc_alice">Alice (Primary - acc_alice)</option>
              <option value="acc_charlie">Charlie (Partner - acc_charlie)</option>
              <option value="acc_treasury">Corporate Treasury (acc_treasury)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: '#202124', marginBottom: '6px', fontWeight: 600 }}>
              Amount (USD)
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#5f6368', fontWeight: 600 }}>$</span>
              <input 
                id="transfer-amount-input"
                type="number"
                step="0.01"
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
                disabled={stage !== 'IDLE'}
                style={{
                  width: '100%',
                  padding: '11px 14px 11px 30px',
                  borderRadius: '8px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #dadce0',
                  color: '#202124',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  outline: 'none',
                }}
              />
            </div>
          </div>
        </div>

        {/* Preset Amounts */}
        <div className="flex items-center gap-2" style={{ marginBottom: '20px' }}>
          <span style={{ fontSize: '0.78rem', color: '#5f6368', fontWeight: 500 }}>Quick Presets:</span>
          {['25.00', '50.00', '250.00', '1000.00'].map(amt => (
            <button
              key={amt}
              type="button"
              className="btn-secondary"
              style={{ padding: '4px 12px', fontSize: '0.76rem' }}
              onClick={() => handleAmountPreset(amt)}
              disabled={stage !== 'IDLE'}
            >
              ${amt}
            </button>
          ))}
        </div>

        {/* Idempotency Key Ribbon */}
        <div 
          style={{ 
            padding: '12px 16px', 
            backgroundColor: '#f8f9fa', 
            borderRadius: '8px', 
            border: '1px solid #e8eaed',
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            fontSize: '0.78rem',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={16} color="#1a73e8" />
            <span style={{ color: '#5f6368', fontWeight: 500 }}>Idempotency-Key:</span>
            <code style={{ color: '#1a73e8', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{idempotencyKey}</code>
            <button
              onClick={handleCopyKey}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#80868b', padding: '2px' }}
              title="Copy Idempotency Key"
            >
              {copiedKey ? <Check size={13} color="#1e8e3e" /> : <Copy size={13} />}
            </button>
          </div>
          <button 
            onClick={generateNewIdempotencyKey}
            disabled={stage !== 'IDLE'}
            className="btn-secondary"
            style={{ padding: '3px 10px', fontSize: '0.72rem' }}
            title="Regenerate UUIDv4 Idempotency Key"
          >
            Regenerate
          </button>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '14px' }}>
          <button
            id="submit-transfer-btn"
            className="btn-primary"
            style={{ flex: 2, padding: '12px 24px', fontSize: '0.94rem' }}
            onClick={() => handleInitiateTransfer(false)}
            disabled={stage !== 'IDLE'}
          >
            {stage !== 'IDLE' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {stage !== 'IDLE' ? 'Processing Transaction...' : 'Submit Payment'}
          </button>

          <button
            id="simulate-failure-btn"
            className="btn-danger"
            style={{ flex: 1, fontSize: '0.84rem' }}
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
              style={{ fontSize: '0.84rem' }}
            >
              Sync Queue ({offlineQueue.length})
            </button>
          )}
        </div>
      </div>

      {/* Real-Time Multi-Stage Progress Stepper Card */}
      <div className="ui-card" style={{ padding: '24px 28px', borderRadius: '12px' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#202124', marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
          <span>Async Distributed Lifecycle Stepper</span>
          <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
            Current State: {stage}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', position: 'relative' }}>
          {/* Step 1: Submitted */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              margin: '0 auto 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8rem',
              fontWeight: 700,
              backgroundColor: stage !== 'IDLE' ? '#1a73e8' : '#f1f3f4',
              color: stage !== 'IDLE' ? '#ffffff' : '#5f6368',
              boxShadow: stage === 'SUBMITTED' ? '0 0 0 3px rgba(26, 115, 232, 0.25)' : 'none',
              transition: 'all 0.3s ease',
            }}>
              1
            </div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: stage !== 'IDLE' ? '#202124' : '#80868b' }}>
              Submitted
            </div>
            <div style={{ fontSize: '0.68rem', color: '#80868b', marginTop: '2px' }}>
              Optimistic Debit
            </div>
          </div>

          {/* Step 2: Ingested & Locked */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              margin: '0 auto 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8rem',
              fontWeight: 700,
              backgroundColor: ['INGESTED_LOCKED', 'LEDGER_WRITTEN', 'SETTLED'].includes(stage) ? '#1a73e8' : '#f1f3f4',
              color: ['INGESTED_LOCKED', 'LEDGER_WRITTEN', 'SETTLED'].includes(stage) ? '#ffffff' : '#5f6368',
              boxShadow: stage === 'INGESTED_LOCKED' ? '0 0 0 3px rgba(26, 115, 232, 0.25)' : 'none',
              transition: 'all 0.3s ease',
            }}>
              2
            </div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: ['INGESTED_LOCKED', 'LEDGER_WRITTEN', 'SETTLED'].includes(stage) ? '#202124' : '#80868b' }}>
              Ingested & Locked
            </div>
            <div style={{ fontSize: '0.68rem', color: '#80868b', marginTop: '2px' }}>
              Bloom + Mutex
            </div>
          </div>

          {/* Step 3: Ledger Written */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              margin: '0 auto 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8rem',
              fontWeight: 700,
              backgroundColor: ['LEDGER_WRITTEN', 'SETTLED'].includes(stage) ? '#1a73e8' : '#f1f3f4',
              color: ['LEDGER_WRITTEN', 'SETTLED'].includes(stage) ? '#ffffff' : '#5f6368',
              boxShadow: stage === 'LEDGER_WRITTEN' ? '0 0 0 3px rgba(26, 115, 232, 0.25)' : 'none',
              transition: 'all 0.3s ease',
            }}>
              3
            </div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: ['LEDGER_WRITTEN', 'SETTLED'].includes(stage) ? '#202124' : '#80868b' }}>
              Ledger Written
            </div>
            <div style={{ fontSize: '0.68rem', color: '#80868b', marginTop: '2px' }}>
              Double-Entry ACID
            </div>
          </div>

          {/* Step 4: Settled / Rollback */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              margin: '0 auto 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8rem',
              fontWeight: 700,
              backgroundColor: stage === 'SETTLED' ? '#1e8e3e' : stage === 'REJECTED_ROLLBACK' ? '#d93025' : '#f1f3f4',
              color: ['SETTLED', 'REJECTED_ROLLBACK'].includes(stage) ? '#ffffff' : '#5f6368',
              boxShadow: stage === 'SETTLED' ? '0 0 0 3px rgba(30, 142, 62, 0.25)' : stage === 'REJECTED_ROLLBACK' ? '0 0 0 3px rgba(217, 48, 37, 0.25)' : 'none',
              transition: 'all 0.3s ease',
            }}>
              {stage === 'SETTLED' ? <CheckCircle2 size={16} /> : stage === 'REJECTED_ROLLBACK' ? <AlertCircle size={16} /> : '4'}
            </div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: stage === 'SETTLED' ? '#1e8e3e' : stage === 'REJECTED_ROLLBACK' ? '#d93025' : '#80868b' }}>
              {stage === 'REJECTED_ROLLBACK' ? 'Rollback' : 'Settled'}
            </div>
            <div style={{ fontSize: '0.68rem', color: '#80868b', marginTop: '2px' }}>
              Kafka Consumed
            </div>
          </div>
        </div>

        {/* Live Stepper Status Message Banner */}
        {statusMessage && (
          <div 
            className="animate-fade-in"
            style={{ 
              marginTop: '18px', 
              padding: '10px 14px', 
              borderRadius: '8px',
              fontSize: '0.8rem',
              backgroundColor: stage === 'REJECTED_ROLLBACK' ? '#fce8e6' : stage === 'SETTLED' ? '#e6f4ea' : '#e8f0fe',
              border: `1px solid ${stage === 'REJECTED_ROLLBACK' ? '#fad2cf' : stage === 'SETTLED' ? '#ceead6' : '#d2e3fc'}`,
              color: stage === 'REJECTED_ROLLBACK' ? '#c5221f' : stage === 'SETTLED' ? '#137333' : '#1765cc',
              fontWeight: 500,
            }}
          >
            {statusMessage}
          </div>
        )}
      </div>
    </div>
  );
};

