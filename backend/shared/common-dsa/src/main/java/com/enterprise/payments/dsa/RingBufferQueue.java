package com.enterprise.payments.dsa;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReferenceArray;

/**
 * 2.4 Ring Buffer (Disruptor Pattern) for Lock-Free Concurrency
 *
 * Implements a high-throughput, cacheline-friendly lock-free ring buffer for
 * pre-Kafka batch aggregation. Sequence numbers are advanced via atomic CAS,
 * eliminating synchronized lock contention and dynamic GC allocations.
 */
public class RingBufferQueue<T> {

    private final int capacity;
    private final int mask;
    private final AtomicReferenceArray<T> entries;

    private final AtomicLong writeSequence = new AtomicLong(0);
    private final AtomicLong readSequence = new AtomicLong(0);

    public RingBufferQueue(int requestedCapacity) {
        if (requestedCapacity <= 0) {
            throw new IllegalArgumentException("Capacity must be positive");
        }
        // Round up to nearest power of 2 for fast bitwise masking
        int cap = 1;
        while (cap < requestedCapacity) {
            cap <<= 1;
        }
        this.capacity = cap;
        this.mask = cap - 1;
        this.entries = new AtomicReferenceArray<>(this.capacity);
    }

    /**
     * Enqueues an item using lock-free CAS sequence progression.
     * @return true if enqueued, false if ring buffer is full.
     */
    public boolean offer(T item) {
        if (item == null) {
            throw new NullPointerException("Null entries are not permitted in RingBuffer");
        }

        while (true) {
            long currentWrite = writeSequence.get();
            long currentRead = readSequence.get();

            if (currentWrite - currentRead >= capacity) {
                return false; // Buffer full
            }

            int index = (int) (currentWrite & mask);
            if (entries.get(index) == null) {
                if (writeSequence.compareAndSet(currentWrite, currentWrite + 1)) {
                    entries.set(index, item);
                    return true;
                }
            } else {
                // Slot not yet freed by consumer; brief spin or yield
                Thread.onSpinWait();
            }
        }
    }

    /**
     * Polls a single item from the ring buffer.
     */
    public T poll() {
        while (true) {
            long currentRead = readSequence.get();
            long currentWrite = writeSequence.get();

            if (currentRead >= currentWrite) {
                return null; // Buffer empty
            }

            int index = (int) (currentRead & mask);
            T item = entries.get(index);
            if (item != null) {
                if (readSequence.compareAndSet(currentRead, currentRead + 1)) {
                    entries.set(index, null);
                    return item;
                }
            } else {
                Thread.onSpinWait();
            }
        }
    }

    /**
     * Drains up to maxBatchSize items into a batch list for bulk Kafka publishing.
     */
    public List<T> drainBatch(int maxBatchSize) {
        List<T> batch = new ArrayList<>(Math.min(maxBatchSize, size()));
        for (int i = 0; i < maxBatchSize; i++) {
            T item = poll();
            if (item == null) break;
            batch.add(item);
        }
        return batch;
    }

    public int size() {
        long diff = writeSequence.get() - readSequence.get();
        return (int) Math.max(0, Math.min(diff, capacity));
    }

    public boolean isEmpty() {
        return readSequence.get() >= writeSequence.get();
    }

    public int capacity() {
        return capacity;
    }

    public void clear() {
        while (poll() != null) {
            // Drain
        }
    }
}
