package com.enterprise.payments.dsa;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

class RingBufferQueueTest {

    @Test
    @DisplayName("Enqueues and polls elements FIFO without loss")
    void shouldEnqueueAndPollFifo() {
        RingBufferQueue<String> ringBuffer = new RingBufferQueue<>(8);
        assertThat(ringBuffer.capacity()).isEqualTo(8);

        for (int i = 0; i < 8; i++) {
            boolean offered = ringBuffer.offer("item-" + i);
            assertThat(offered).isTrue();
        }

        // Buffer full
        assertThat(ringBuffer.offer("overflow")).isFalse();

        // Drain batch of 4
        List<String> batch = ringBuffer.drainBatch(4);
        assertThat(batch).containsExactly("item-0", "item-1", "item-2", "item-3");

        // Now can offer more
        assertThat(ringBuffer.offer("item-8")).isTrue();

        // Poll remaining
        assertThat(ringBuffer.poll()).isEqualTo("item-4");
    }

    @Test
    @DisplayName("Handles high-concurrency multi-producer and single-consumer correctly")
    void shouldHandleConcurrentProducersAndConsumers() throws InterruptedException {
        int capacity = 1024;
        RingBufferQueue<Integer> ringBuffer = new RingBufferQueue<>(capacity);
        int numProducers = 8;
        int itemsPerProducer = 1000;
        int totalItems = numProducers * itemsPerProducer;

        ExecutorService producerPool = Executors.newFixedThreadPool(numProducers);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch producerDoneLatch = new CountDownLatch(numProducers);

        for (int p = 0; p < numProducers; p++) {
            final int producerId = p;
            producerPool.submit(() -> {
                try {
                    startLatch.await();
                    for (int i = 0; i < itemsPerProducer; i++) {
                        int val = producerId * 10_000 + i;
                        while (!ringBuffer.offer(val)) {
                            Thread.onSpinWait();
                        }
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    producerDoneLatch.countDown();
                }
            });
        }

        List<Integer> consumedItems = Collections.synchronizedList(new ArrayList<>());
        AtomicInteger consumedCount = new AtomicInteger(0);

        Thread consumerThread = new Thread(() -> {
            while (consumedCount.get() < totalItems) {
                Integer item = ringBuffer.poll();
                if (item != null) {
                    consumedItems.add(item);
                    consumedCount.incrementAndGet();
                } else {
                    Thread.onSpinWait();
                }
            }
        });
        consumerThread.start();

        startLatch.countDown();
        producerDoneLatch.await();
        consumerThread.join(10_000);
        producerPool.shutdown();

        assertThat(consumedCount.get()).isEqualTo(totalItems);
        assertThat(consumedItems).hasSize(totalItems);
    }
}
