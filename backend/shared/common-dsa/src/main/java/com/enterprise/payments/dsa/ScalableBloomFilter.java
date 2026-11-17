package com.enterprise.payments.dsa;

import java.nio.charset.StandardCharsets;
import java.util.BitSet;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantReadWriteLock;

/**
 * 2.2 Scalable Bloom Filter for Idempotency Fast-Path
 *
 * Provides O(k) probabilistic set-membership testing with zero false negatives.
 * If mightContain(key) returns false, the idempotency key is GUARANTEED to be new,
 * allowing requests to bypass expensive distributed cache or DB lookups.
 */
public class ScalableBloomFilter {

    private final int expectedInsertions;
    private final double falsePositiveProbability;
    private final int bitArraySize;
    private final int numHashFunctions;
    private final BitSet bitSet;
    private final AtomicInteger elementCount = new AtomicInteger(0);
    private final ReentrantReadWriteLock rwLock = new ReentrantReadWriteLock();

    public ScalableBloomFilter(int expectedInsertions, double falsePositiveProbability) {
        if (expectedInsertions <= 0) {
            throw new IllegalArgumentException("expectedInsertions must be > 0");
        }
        if (falsePositiveProbability <= 0.0 || falsePositiveProbability >= 1.0) {
            throw new IllegalArgumentException("falsePositiveProbability must be between 0 and 1 exclusive");
        }
        this.expectedInsertions = expectedInsertions;
        this.falsePositiveProbability = falsePositiveProbability;

        // m = - (n * ln(p)) / (ln(2)^2)
        long m = (long) Math.ceil(-1.0 * expectedInsertions * Math.log(falsePositiveProbability) / (Math.log(2) * Math.log(2)));
        this.bitArraySize = (int) Math.min(m, Integer.MAX_VALUE - 8);

        // k = (m / n) * ln(2)
        int k = (int) Math.round(((double) this.bitArraySize / expectedInsertions) * Math.log(2));
        this.numHashFunctions = Math.max(1, k);
        this.bitSet = new BitSet(this.bitArraySize);
    }

    /**
     * Default constructor: 100,000 items with 1% false-positive tolerance.
     */
    public ScalableBloomFilter() {
        this(100_000, 0.01);
    }

    /**
     * Tests if key might have been added.
     * @return false if the key is DEFINITIVELY NOT in the filter (Zero False Negatives);
     *         true if the key might be in the filter.
     */
    public boolean mightContain(String key) {
        if (key == null) return false;
        byte[] bytes = key.getBytes(StandardCharsets.UTF_8);
        int[] hashes = computeHashes(bytes, numHashFunctions, bitArraySize);

        rwLock.readLock().lock();
        try {
            for (int hash : hashes) {
                if (!bitSet.get(hash)) {
                    return false; // Guaranteed new key
                }
            }
            return true;
        } finally {
            rwLock.readLock().unlock();
        }
    }

    /**
     * Adds an idempotency key to the Bloom filter.
     */
    public void put(String key) {
        if (key == null) return;
        byte[] bytes = key.getBytes(StandardCharsets.UTF_8);
        int[] hashes = computeHashes(bytes, numHashFunctions, bitArraySize);

        rwLock.writeLock().lock();
        try {
            for (int hash : hashes) {
                bitSet.set(hash, true);
            }
            elementCount.incrementAndGet();
        } finally {
            rwLock.writeLock().unlock();
        }
    }

    /**
     * Kirsch-Mitzenmacher optimization:
     * Generates k distinct hash values using two hash calls (hash1 and hash2):
     * g_i(x) = (hash1(x) + i * hash2(x)) mod m
     */
    public static int[] computeHashes(byte[] data, int k, int m) {
        int[] result = new int[k];
        int hash1 = murmur3_32(data, 0, data.length, 0x9747b28c);
        int hash2 = murmur3_32(data, 0, data.length, 0x1b873593);
        if (hash2 == 0) hash2 = 1;

        for (int i = 0; i < k; i++) {
            long combined = ((long) hash1 + (long) i * (long) hash2) & 0x7ffffffffffffffL;
            result[i] = (int) (combined % m);
        }
        return result;
    }

    public static int[] computeVisualHashIndices(String key, int k, int m) {
        if (key == null) return new int[0];
        return computeHashes(key.getBytes(StandardCharsets.UTF_8), k, m);
    }

    /**
     * Standard 32-bit MurmurHash3 implementation.
     */
    public static int murmur3_32(byte[] data, int offset, int len, int seed) {
        int c1 = 0xcc9e2d51;
        int c2 = 0x1b873593;
        int h1 = seed;
        int roundedEnd = offset + (len & 0xfffffffc);

        for (int i = offset; i < roundedEnd; i += 4) {
            int k1 = (data[i] & 0xff) | ((data[i + 1] & 0xff) << 8) | ((data[i + 2] & 0xff) << 16) | (data[i + 3] << 24);
            k1 *= c1;
            k1 = Integer.rotateLeft(k1, 15);
            k1 *= c2;

            h1 ^= k1;
            h1 = Integer.rotateLeft(h1, 13);
            h1 = h1 * 5 + 0xe6546b64;
        }

        int k1 = 0;
        switch (len & 0x03) {
            case 3:
                k1 = (data[roundedEnd + 2] & 0xff) << 16;
            case 2:
                k1 |= (data[roundedEnd + 1] & 0xff) << 8;
            case 1:
                k1 |= (data[roundedEnd] & 0xff);
                k1 *= c1;
                k1 = Integer.rotateLeft(k1, 15);
                k1 *= c2;
                h1 ^= k1;
        }

        h1 ^= len;
        h1 ^= (h1 >>> 16);
        h1 *= 0x85ebca6b;
        h1 ^= (h1 >>> 13);
        h1 *= 0xc2b2ae35;
        h1 ^= (h1 >>> 16);

        return h1;
    }

    public int getBitArraySize() {
        return bitArraySize;
    }

    public int getNumHashFunctions() {
        return numHashFunctions;
    }

    public int getElementCount() {
        return elementCount.get();
    }

    public double getFalsePositiveProbability() {
        return falsePositiveProbability;
    }

    public void clear() {
        rwLock.writeLock().lock();
        try {
            bitSet.clear();
            elementCount.set(0);
        } finally {
            rwLock.writeLock().unlock();
        }
    }
}
