package com.enterprise.payments.dsa;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;

/**
 * 2.1 Sliding Window Counter Rate Limiter
 *
 * Implements a sliding window rate limiter that prevents fixed-window boundary spikes.
 * Contains both the production-grade Redis ZSET + Lua script specification
 * and a high-performance, thread-safe in-memory sliding window implementation.
 */
public class SlidingWindowRateLimiter {

    /**
     * Production Redis Lua Script executed atomically via EVAL/EVALSHA against Redis cluster:
     * Maintains timestamps in Redis Sorted Set (ZSET).
     */
    public static final String REDIS_LUA_SCRIPT =
            "local key = KEYS[1]\n" +
            "local now = tonumber(ARGV[1])\n" +
            "local window = tonumber(ARGV[2])\n" +
            "local limit = tonumber(ARGV[3])\n" +
            "local clearBefore = now - window\n" +
            "redis.call('ZREMRANGEBYSCORE', key, 0, clearBefore)\n" +
            "local currentRequests = redis.call('ZCARD', key)\n" +
            "if currentRequests < limit then\n" +
            "    redis.call('ZADD', key, now, now)\n" +
            "    return 1\n" +
            "else\n" +
            "    return 0\n" +
            "end";

    private final long windowMillis;
    private final int maxLimit;
    private final ConcurrentHashMap<String, ConcurrentLinkedDeque<Long>> keyWindows = new ConcurrentHashMap<>();

    public SlidingWindowRateLimiter(long windowMillis, int maxLimit) {
        if (windowMillis <= 0 || maxLimit <= 0) {
            throw new IllegalArgumentException("windowMillis and maxLimit must be positive");
        }
        this.windowMillis = windowMillis;
        this.maxLimit = maxLimit;
    }

    /**
     * Checks whether a request for the given key is allowed right now.
     */
    public boolean allowRequest(String key) {
        return allowRequest(key, System.currentTimeMillis(), this.windowMillis, this.maxLimit);
    }

    /**
     * Core algorithmic evaluation of sliding window counter.
     * 1. Purges timestamps older than (now - windowMillis)
     * 2. Checks current count against maxLimit
     * 3. Atomically appends timestamp if under limit
     */
    public boolean allowRequest(String key, long nowEpochMillis, long windowDurationMillis, int limit) {
        ConcurrentLinkedDeque<Long> timestamps = keyWindows.computeIfAbsent(key, k -> new ConcurrentLinkedDeque<>());

        synchronized (timestamps) {
            long windowStart = nowEpochMillis - windowDurationMillis;
            while (!timestamps.isEmpty() && timestamps.peekFirst() <= windowStart) {
                timestamps.pollFirst();
            }

            if (timestamps.size() < limit) {
                timestamps.addLast(nowEpochMillis);
                return true;
            } else {
                return false;
            }
        }
    }

    /**
     * Returns the current count of requests within the active sliding window.
     */
    public int getCurrentCount(String key, long nowEpochMillis) {
        ConcurrentLinkedDeque<Long> timestamps = keyWindows.get(key);
        if (timestamps == null) {
            return 0;
        }
        synchronized (timestamps) {
            long windowStart = nowEpochMillis - windowMillis;
            while (!timestamps.isEmpty() && timestamps.peekFirst() <= windowStart) {
                timestamps.pollFirst();
            }
            return timestamps.size();
        }
    }

    public long getWindowMillis() {
        return windowMillis;
    }

    public int getMaxLimit() {
        return maxLimit;
    }

    public void reset(String key) {
        keyWindows.remove(key);
    }

    public void clearAll() {
        keyWindows.clear();
    }
}
