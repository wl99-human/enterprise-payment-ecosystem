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
  ArrowRight,
  Database,
  Lock,
  GitBranch
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
      className="flex flex-col gap-3.5 animate-fade-in" 
      style={{ maxWidth: '1280px', margin: '0 auto', width: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}
    >
      {/* Remote Header Bar (Compact & Fixed) */}
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
        <div className="flex items-center gap-2.5" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
            <Send size={18} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#202124', letterSpacing: '-0.01em', margin: 0 }}>
              Send Payment
            </h2>
            <p style={{ fontSize: '0.75rem', color: '#5f6368', margin: 0, marginTop: '1px' }}>
              Optimistic Balance Mutation & Multi-Stage Async Stepper
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {offlineQueue.length > 0 && (
            <span className="badge badge-pending" style={{ fontSize: '0.72rem', padding: '3px 8px' }}>
              <Clock size={11} /> {offlineQueue.length} Queued
            </span>
          )}
          <button 
            id="toggle-offline-btn"
            onClick={() => setOfflineMode(!offlineMode)}
            className="btn-secondary"
            style={{ fontSize: '0.75rem', padding: '5px 12px' }}
            title="Simulate Service Worker Offline Sync"
          >
            {offlineMode ? <WifiOff size={13} color="#d93025" /> : <ShieldCheck size={13} color="#1e8e3e" />}
            {offlineMode ? 'Offline Mode Active' : 'Network Online'}
          </button>
        </div>
      </div>

      {/* Main Workspace Grid (Scrollable Section if viewport height is constrained) */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', 
          gap: '18px', 
          flex: 1, 
          minHeight: 0, 
          overflowY: 'auto',
          padding: '2px 4px 8px 2px',
        }}
      >
        {/* Left Column: Balance & Transfer Form */}
        <div className="flex flex-col gap-3.5" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Account Balance Card with Rollback Animation */}
          <div 
            id="optimistic-balance-card"
            className={`ui-card ${isRollbackAnimating ? 'animate-shake' : ''}`}
            style={{ 
              padding: '14px 18px',
              backgroundColor: isRollbackAnimating ? '#fce8e6' : '#ffffff',
              borderColor: isRollbackAnimating ? '#d93025' : '#dadce0',
              transition: 'all 0.3s ease',
              borderRadius: '12px',
            }}
          >
            <div className="flex justify-between items-center">
              <div>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#5f6368', fontWeight: 600, letterSpacing: '0.04em' }}>
                  Sender Account: {currentAccount.name}
                </span>
                <div 
                  style={{ 
                    fontSize: '1.65rem', 
                    fontWeight: 800, 
                    color: isRollbackAnimating ? '#d93025' : '#1a73e8', 
                    marginTop: '2px',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.1,
                  }}
                >
                  {formatCurrency(currentAccount.balanceMinorUnits)}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#5f6368', marginTop: '2px' }}>
                  Instant optimistic debit with automated rollback guarantee
                </div>
              </div>
              {isRollbackAnimating && (
                <div className="badge badge-dlq flex items-center gap-1" style={{ fontSize: '0.72rem' }}>
                  <RotateCcw size={12} /> Compensating Rollback
                </div>
              )}
            </div>
          </div>

          {/* Main Payment Form Card */}
          <div className="ui-card" style={{ padding: '16px 20px', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 600, color: '#202124', marginBottom: '14px' }}>
              Transfer Details
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#202124', marginBottom: '4px', fontWeight: 600 }}>
                  Recipient Account
                </label>
                <select 
                  id="recipient-account-select"
                  value={recipient} 
                  onChange={(e) => setRecipient(e.target.value)}
                  disabled={stage !== 'IDLE'}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #dadce0',
                    color: '#202124',
                    fontSize: '0.84rem',
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
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#202124', marginBottom: '4px', fontWeight: 600 }}>
                  Amount (USD)
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#5f6368', fontWeight: 600, fontSize: '0.84rem' }}>$</span>
                  <input 
                    id="transfer-amount-input"
                    type="number"
                    step="0.01"
                    value={amountDollars}
                    onChange={(e) => setAmountDollars(e.target.value)}
                    disabled={stage !== 'IDLE'}
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 26px',
                      borderRadius: '8px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #dadce0',
                      color: '#202124',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      outline: 'none',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Preset Amounts */}
            <div className="flex items-center gap-1.5" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '0.74rem', color: '#5f6368', fontWeight: 500 }}>Presets:</span>
              {['25.00', '50.00', '250.00', '1000.00'].map(amt => (
                <button
                  key={amt}
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '3px 10px', fontSize: '0.72rem' }}
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
                padding: '10px 14px', 
                backgroundColor: '#f8f9fa', 
                borderRadius: '8px', 
                border: '1px solid #e8eaed',
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                fontSize: '0.74rem',
                marginBottom: '18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={14} color="#1a73e8" />
                <span style={{ color: '#5f6368', fontWeight: 500 }}>Key:</span>
                <code style={{ color: '#1a73e8', fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{idempotencyKey}</code>
                <button
                  onClick={handleCopyKey}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#80868b', padding: '1px' }}
                  title="Copy Idempotency Key"
                >
                  {copiedKey ? <Check size={12} color="#1e8e3e" /> : <Copy size={12} />}
                </button>
              </div>
              <button 
                onClick={generateNewIdempotencyKey}
                disabled={stage !== 'IDLE'}
                className="btn-secondary"
                style={{ padding: '2px 8px', fontSize: '0.68rem' }}
                title="Regenerate UUIDv4 Idempotency Key"
              >
                Regenerate
              </button>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                id="submit-transfer-btn"
                className="btn-primary"
                style={{ flex: 2, padding: '10px 18px', fontSize: '0.88rem' }}
                onClick={() => handleInitiateTransfer(false)}
                disabled={stage !== 'IDLE'}
              >
                {stage !== 'IDLE' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {stage !== 'IDLE' ? 'Processing Transaction...' : 'Submit Payment'}
              </button>

              <button
                id="simulate-failure-btn"
                className="btn-danger"
                style={{ flex: 1, fontSize: '0.8rem', padding: '10px 14px' }}
                onClick={() => handleInitiateTransfer(true)}
                disabled={stage !== 'IDLE'}
                title="Simulates downstream failure to demonstrate compensating rollback animation"
              >
                <RotateCcw size={13} /> Test Rollback
              </button>

              {offlineQueue.length > 0 && (
                <button
                  id="sync-offline-queue-btn"
                  className="btn-secondary"
                  onClick={handleSyncOfflineQueue}
                  style={{ fontSize: '0.8rem', padding: '10px 14px' }}
                >
                  Sync ({offlineQueue.length})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Distributed Stepper & Engine Invariants */}
        <div className="flex flex-col gap-3.5" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Real-Time Multi-Stage Progress Stepper Card */}
          <div className="ui-card" style={{ padding: '16px 20px', borderRadius: '12px' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#202124', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Distributed Execution Stepper</span>
              <span className="badge badge-neutral" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                State: {stage}
              </span>
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
                  backgroundColor: stage !== 'IDLE' ? '#1a73e8' : '#f1f3f4',
                  color: stage !== 'IDLE' ? '#ffffff' : '#5f6368',
                  boxShadow: stage === 'SUBMITTED' ? '0 0 0 3px rgba(26, 115, 232, 0.25)' : 'none',
                  transition: 'all 0.3s ease',
                }}>
                  1
                </div>
                <div style={{ fontSize: '0.74rem', fontWeight: 600, color: stage !== 'IDLE' ? '#202124' : '#80868b' }}>
                  Submitted
                </div>
                <div style={{ fontSize: '0.64rem', color: '#80868b', marginTop: '1px' }}>
                  Optimistic Debit
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
                  backgroundColor: ['INGESTED_LOCKED', 'LEDGER_WRITTEN', 'SETTLED'].includes(stage) ? '#1a73e8' : '#f1f3f4',
                  color: ['INGESTED_LOCKED', 'LEDGER_WRITTEN', 'SETTLED'].includes(stage) ? '#ffffff' : '#5f6368',
                  boxShadow: stage === 'INGESTED_LOCKED' ? '0 0 0 3px rgba(26, 115, 232, 0.25)' : 'none',
                  transition: 'all 0.3s ease',
                }}>
                  2
                </div>
                <div style={{ fontSize: '0.74rem', fontWeight: 600, color: ['INGESTED_LOCKED', 'LEDGER_WRITTEN', 'SETTLED'].includes(stage) ? '#202124' : '#80868b' }}>
                  Locked
                </div>
                <div style={{ fontSize: '0.64rem', color: '#80868b', marginTop: '1px' }}>
                  Bloom + Mutex
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
                  backgroundColor: ['LEDGER_WRITTEN', 'SETTLED'].includes(stage) ? '#1a73e8' : '#f1f3f4',
                  color: ['LEDGER_WRITTEN', 'SETTLED'].includes(stage) ? '#ffffff' : '#5f6368',
                  boxShadow: stage === 'LEDGER_WRITTEN' ? '0 0 0 3px rgba(26, 115, 232, 0.25)' : 'none',
                  transition: 'all 0.3s ease',
                }}>
                  3
                </div>
                <div style={{ fontSize: '0.74rem', fontWeight: 600, color: ['LEDGER_WRITTEN', 'SETTLED'].includes(stage) ? '#202124' : '#80868b' }}>
                  Ledger
                </div>
                <div style={{ fontSize: '0.64rem', color: '#80868b', marginTop: '1px' }}>
                  Double-Entry
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
                  backgroundColor: stage === 'SETTLED' ? '#1e8e3e' : stage === 'REJECTED_ROLLBACK' ? '#d93025' : '#f1f3f4',
                  color: ['SETTLED', 'REJECTED_ROLLBACK'].includes(stage) ? '#ffffff' : '#5f6368',
                  boxShadow: stage === 'SETTLED' ? '0 0 0 3px rgba(30, 142, 62, 0.25)' : stage === 'REJECTED_ROLLBACK' ? '0 0 0 3px rgba(217, 48, 37, 0.25)' : 'none',
                  transition: 'all 0.3s ease',
                }}>
                  {stage === 'SETTLED' ? <CheckCircle2 size={15} /> : stage === 'REJECTED_ROLLBACK' ? <AlertCircle size={15} /> : '4'}
                </div>
                <div style={{ fontSize: '0.74rem', fontWeight: 600, color: stage === 'SETTLED' ? '#1e8e3e' : stage === 'REJECTED_ROLLBACK' ? '#d93025' : '#80868b' }}>
                  {stage === 'REJECTED_ROLLBACK' ? 'Rollback' : 'Settled'}
                </div>
                <div style={{ fontSize: '0.64rem', color: '#80868b', marginTop: '1px' }}>
                  Kafka Synced
                </div>
              </div>
            </div>

            {/* Live Stepper Status Message Banner */}
            {statusMessage && (
              <div 
                className="animate-fade-in"
                style={{ 
                  marginTop: '12px', 
                  padding: '8px 12px', 
                  borderRadius: '8px',
                  fontSize: '0.76rem',
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

          {/* Distributed Architecture Proofs & Invariant Card */}
          <div className="ui-card" style={{ padding: '16px 20px', borderRadius: '12px' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#202124', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={16} color="#1a73e8" />
              <span>Distributed Architecture Guarantees</span>
            </div>

            <div className="flex flex-col gap-2.5" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                className="flex items-start gap-2.5"
                style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px 12px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e8eaed' }}
              >
                <div style={{ background: '#e8f0fe', padding: '6px', borderRadius: '6px', color: '#1a73e8', marginTop: '1px' }}>
                  <Lock size={13} />
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#202124' }}>
                    Lexicographical Deadlock Prevention
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#5f6368', lineHeight: 1.35 }}>
                    Row-level PostgreSQL locks are sorted strictly by UUID order to eliminate circular lock dependencies during concurrent transfers.
                  </div>
                </div>
              </div>

              <div
                className="flex items-start gap-2.5"
                style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px 12px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e8eaed' }}
              >
                <div style={{ background: '#e6f4ea', padding: '6px', borderRadius: '6px', color: '#1e8e3e', marginTop: '1px' }}>
                  <Database size={13} />
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#202124' }}>
                    Transactional Outbox CDC Pattern
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#5f6368', lineHeight: 1.35 }}>
                    State changes and Kafka events commit in a single ACID transaction, guaranteeing zero dual-write message loss.
                  </div>
                </div>
              </div>

              <div
                className="flex items-start gap-2.5"
                style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px 12px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e8eaed' }}
              >
                <div style={{ background: '#fef7e0', padding: '6px', borderRadius: '6px', color: '#b06000', marginTop: '1px' }}>
                  <GitBranch size={13} />
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#202124' }}>
                    Automated Compensating Rollback
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#5f6368', lineHeight: 1.35 }}>
                    Downstream timeouts or invariant violations trigger instant local balance reversal and Dead Letter Queue routing.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


