package com.enterprise.payments.ingestion.idempotency;

import com.enterprise.payments.dsa.ScalableBloomFilter;
import com.enterprise.payments.ingestion.dto.TransferResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Enterprise Idempotency Guard combining Scalable Bloom Filter fast-path
 * and distributed mutex locking (Redis / in-memory).
 */
@Service
public class IdempotencyFastPathService {

    private final ScalableBloomFilter bloomFilter;
    private final Map<String, String> activeLocks = new ConcurrentHashMap<>();
    private final Map<String, TransferResponse> cachedResponses = new ConcurrentHashMap<>();

    public IdempotencyFastPathService(
            @Value("${ecosystem.bloom-filter.expected-insertions:500000}") int expectedInsertions,
            @Value("${ecosystem.bloom-filter.false-positive-probability:0.01}") double falsePositiveProbability) {
        this.bloomFilter = new ScalableBloomFilter(expectedInsertions, falsePositiveProbability);
    }

    /**
     * Checks if key might be duplicate.
     * Returns true if definitely new key (zero false negatives from Bloom Filter).
     */
    public boolean isDefinitivelyNewKey(String idempotencyKey) {
        return !bloomFilter.mightContain(idempotencyKey);
    }

    /**
     * Attempts to acquire distributed mutex lock for the idempotency key.
     * In production with Redis: SET lock:idempotency:{key} {txId} NX PX 5000
     */
    public boolean tryAcquireMutexLock(String idempotencyKey, String transactionId) {
        String existing = activeLocks.putIfAbsent(idempotencyKey, transactionId);
        return existing == null;
    }

    public void releaseMutexLock(String idempotencyKey) {
        activeLocks.remove(idempotencyKey);
    }

    public void markCommitted(String idempotencyKey, TransferResponse response) {
        bloomFilter.put(idempotencyKey);
        cachedResponses.put(idempotencyKey, response);
        releaseMutexLock(idempotencyKey);
    }

    public TransferResponse getCachedResponse(String idempotencyKey) {
        return cachedResponses.get(idempotencyKey);
    }

    public boolean isCurrentlyProcessing(String idempotencyKey) {
        return activeLocks.containsKey(idempotencyKey);
    }
}
