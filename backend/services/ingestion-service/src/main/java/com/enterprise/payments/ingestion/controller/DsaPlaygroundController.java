package com.enterprise.payments.ingestion.controller;

import com.enterprise.payments.dsa.ScalableBloomFilter;
import com.enterprise.payments.dsa.SlidingWindowRateLimiter;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

@RestController
@RequestMapping("/api/v1/playground")
@CrossOrigin(originPatterns = "*")
public class DsaPlaygroundController {

    private static final int BIT_ARRAY_SIZE = 64;
    private static final int NUM_HASHES = 4;

    private final boolean[] visualBits = new boolean[BIT_ARRAY_SIZE];
    private final AtomicInteger visualInsertedCount = new AtomicInteger(0);
    private final SlidingWindowRateLimiter playgroundLimiter = new SlidingWindowRateLimiter(10_000, 10);

    @PostMapping("/bloom/insert")
    public ResponseEntity<?> insertBloomKey(@RequestParam String key) {
        int[] indices = ScalableBloomFilter.computeVisualHashIndices(key, NUM_HASHES, BIT_ARRAY_SIZE);
        boolean[] snapshot;
        int n;

        synchronized (visualBits) {
            for (int idx : indices) {
                if (idx >= 0 && idx < BIT_ARRAY_SIZE) {
                    visualBits[idx] = true;
                }
            }
            n = visualInsertedCount.incrementAndGet();
            snapshot = visualBits.clone();
        }

        double fpProb = Math.pow(1.0 - Math.exp(-(double) NUM_HASHES * n / BIT_ARRAY_SIZE), NUM_HASHES);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("key", key);
        response.put("hashIndices", indices);
        response.put("bitArray", snapshot);
        response.put("elementCount", n);
        response.put("falsePositiveProbability", fpProb);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/bloom/check")
    public ResponseEntity<?> checkBloomKey(@RequestParam String key) {
        int[] indices = ScalableBloomFilter.computeVisualHashIndices(key, NUM_HASHES, BIT_ARRAY_SIZE);
        boolean[] snapshot;
        boolean mightContain = indices.length > 0;

        synchronized (visualBits) {
            for (int idx : indices) {
                if (idx < 0 || idx >= BIT_ARRAY_SIZE || !visualBits[idx]) {
                    mightContain = false;
                }
            }
            snapshot = visualBits.clone();
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("key", key);
        response.put("hashIndices", indices);
        response.put("mightContain", mightContain);
        response.put("definitelyNew", !mightContain);
        response.put("bitArray", snapshot);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/bloom/reset")
    public ResponseEntity<?> resetBloomFilter() {
        boolean[] snapshot;
        synchronized (visualBits) {
            for (int i = 0; i < BIT_ARRAY_SIZE; i++) {
                visualBits[i] = false;
            }
            visualInsertedCount.set(0);
            snapshot = visualBits.clone();
        }

        return ResponseEntity.ok(Map.of(
                "status", "RESET",
                "bitArray", snapshot,
                "elementCount", 0
        ));
    }

    @PostMapping("/ratelimit/test")
    public ResponseEntity<?> testRateLimiter(
            @RequestParam(defaultValue = "merchant_api_01") String clientKey,
            @RequestParam(defaultValue = "1") int burstCount,
            @RequestParam(defaultValue = "10") int maxLimit,
            @RequestParam(defaultValue = "10000") long windowMillis) {

        int allowedCount = 0;
        int throttledCount = 0;
        long now = System.currentTimeMillis();

        for (int i = 0; i < burstCount; i++) {
            if (playgroundLimiter.allowRequest(clientKey, now, windowMillis, maxLimit)) {
                allowedCount++;
            } else {
                throttledCount++;
            }
        }

        int activeWindowCount = playgroundLimiter.getCurrentCount(clientKey, now);
        int httpStatus = throttledCount > 0 ? 429 : 200;

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("clientKey", clientKey);
        response.put("allowedCount", allowedCount);
        response.put("throttledCount", throttledCount);
        response.put("activeWindowCount", activeWindowCount);
        response.put("maxLimit", maxLimit);
        response.put("windowMillis", windowMillis);
        response.put("httpStatus", httpStatus);
        return ResponseEntity.ok(response);
    }
}
