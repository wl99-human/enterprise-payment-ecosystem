package com.enterprise.payments.dsa;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

class SlidingWindowRateLimiterTest {

    @Test
    @DisplayName("Allows requests up to limit and rejects excess within the same window")
    void shouldEnforceRateLimitWithinWindow() {
        long windowMillis = 1000;
        int maxLimit = 5;
        SlidingWindowRateLimiter limiter = new SlidingWindowRateLimiter(windowMillis, maxLimit);
        String clientKey = "client-user-123";

        long now = 10_000L;
        // First 5 requests allowed
        for (int i = 0; i < maxLimit; i++) {
            boolean allowed = limiter.allowRequest(clientKey, now + (i * 50), windowMillis, maxLimit);
            assertThat(allowed).isTrue();
        }

        // 6th request within window rejected
        boolean rejected = limiter.allowRequest(clientKey, now + 300, windowMillis, maxLimit);
        assertThat(rejected).isFalse();

        // After window expires (now + 1050), earlier timestamps are pruned
        boolean allowedAfterWindow = limiter.allowRequest(clientKey, now + 1050, windowMillis, maxLimit);
        assertThat(allowedAfterWindow).isTrue();
    }

    @Test
    @DisplayName("Handles concurrent access safely without bursting past limit")
    void shouldHandleConcurrentRequests() throws InterruptedException {
        long windowMillis = 2000;
        int maxLimit = 50;
        SlidingWindowRateLimiter limiter = new SlidingWindowRateLimiter(windowMillis, maxLimit);
        String clientKey = "concurrent-client";

        int totalThreads = 100;
        ExecutorService executor = Executors.newFixedThreadPool(16);
        CountDownLatch latch = new CountDownLatch(totalThreads);
        AtomicInteger allowedCount = new AtomicInteger(0);
        AtomicInteger rejectedCount = new AtomicInteger(0);

        long fixedTime = System.currentTimeMillis();
        for (int i = 0; i < totalThreads; i++) {
            executor.submit(() -> {
                try {
                    if (limiter.allowRequest(clientKey, fixedTime, windowMillis, maxLimit)) {
                        allowedCount.incrementAndGet();
                    } else {
                        rejectedCount.incrementAndGet();
                    }
                } finally {
                    latch.countDown();
                }
            });
        }

        latch.await();
        executor.shutdown();

        assertThat(allowedCount.get()).isEqualTo(maxLimit);
        assertThat(rejectedCount.get()).isEqualTo(totalThreads - maxLimit);
    }
}
