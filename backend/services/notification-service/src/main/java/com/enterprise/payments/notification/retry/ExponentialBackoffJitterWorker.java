package com.enterprise.payments.notification.retry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Supplier;

/**
 * Step 4: Exponential Backoff & Jitter Worker
 * Implements exponential backoff with decorrelated randomized jitter
 * (1s ± 200ms, 2s ± 400ms, 4s ± 800ms) to prevent thundering herd on downstream webhooks.
 */
@Component
public class ExponentialBackoffJitterWorker {

    private static final Logger log = LoggerFactory.getLogger(ExponentialBackoffJitterWorker.class);

    private final int maxAttempts;
    private final long baseDelayMs;
    private final double jitterRatio;

    public ExponentialBackoffJitterWorker(
            @Value("${ecosystem.retry.max-attempts:3}") int maxAttempts,
            @Value("${ecosystem.retry.base-delay-ms:1000}") long baseDelayMs,
            @Value("${ecosystem.retry.jitter-ratio:0.2}") double jitterRatio) {
        this.maxAttempts = maxAttempts;
        this.baseDelayMs = baseDelayMs;
        this.jitterRatio = jitterRatio;
    }

    public <T> T executeWithRetry(String operationName, Supplier<T> task) throws Exception {
        int attempt = 0;
        Exception lastException = null;

        while (attempt < maxAttempts) {
            try {
                attempt++;
                return task.get();
            } catch (Exception ex) {
                lastException = ex;
                if (attempt >= maxAttempts) {
                    log.error("Exhausted all {} retry attempts for {}: {}", maxAttempts, operationName, ex.getMessage());
                    break;
                }

                long backoff = calculateDelayWithJitter(attempt);
                log.warn("Attempt {} failed for {}. Backing off for {}ms before retry. Error: {}",
                        attempt, operationName, backoff, ex.getMessage());

                try {
                    Thread.sleep(backoff);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Retry execution interrupted", ie);
                }
            }
        }

        throw lastException != null ? lastException : new RuntimeException("Retry failed with unknown error");
    }

    public long calculateDelayWithJitter(int attempt) {
        long exponentialBase = (long) (baseDelayMs * Math.pow(2, attempt - 1));
        double jitterMagnitude = exponentialBase * jitterRatio;
        double randomFactor = ThreadLocalRandom.current().nextDouble(-1.0, 1.0);
        long jitter = (long) (jitterMagnitude * randomFactor);
        return Math.max(100, exponentialBase + jitter);
    }

    public int getMaxAttempts() {
        return maxAttempts;
    }
}
