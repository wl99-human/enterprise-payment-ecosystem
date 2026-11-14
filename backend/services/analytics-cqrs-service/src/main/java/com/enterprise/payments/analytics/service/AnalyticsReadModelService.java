package com.enterprise.payments.analytics.service;

import com.enterprise.payments.analytics.model.AccountSummaryReadModel;
import com.enterprise.payments.analytics.model.PaymentTransactionReadModel;
import com.enterprise.payments.analytics.model.SystemMetricSnapshot;
import com.enterprise.payments.events.PaymentSettledEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class AnalyticsReadModelService {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsReadModelService.class);
    private static final int MAX_RECENT_TRANSACTIONS = 1000;
    private static final int KAFKA_PARTITIONS = 12;

    // Fast-path O(1) read models
    private final ConcurrentHashMap<String, PaymentTransactionReadModel> transactionsById = new ConcurrentHashMap<>();
    private final ConcurrentLinkedDeque<PaymentTransactionReadModel> recentTransactions = new ConcurrentLinkedDeque<>();
    private final ConcurrentHashMap<String, AccountSummaryReadModel> accountSummaries = new ConcurrentHashMap<>();

    // Real-time telemetry tracking
    private final AtomicLong totalTransactions = new AtomicLong(0);
    private final ConcurrentLinkedDeque<Long> recentTimestamps = new ConcurrentLinkedDeque<>();
    private final ConcurrentLinkedDeque<Long> recentLatencies = new ConcurrentLinkedDeque<>();
    private final ConcurrentHashMap<Integer, AtomicLong> partitionCounters = new ConcurrentHashMap<>();

    // SSE Subscriber registries
    private final ConcurrentHashMap<String, CopyOnWriteArrayList<SseEmitter>> accountEmitters = new ConcurrentHashMap<>();
    private final CopyOnWriteArrayList<SseEmitter> globalLedgerEmitters = new CopyOnWriteArrayList<>();
    private final CopyOnWriteArrayList<SseEmitter> metricsEmitters = new CopyOnWriteArrayList<>();

    public AnalyticsReadModelService() {
        for (int i = 0; i < KAFKA_PARTITIONS; i++) {
            partitionCounters.put(i, new AtomicLong(0));
        }

        // Initialize default seed accounts for seamless demo experience
        seedAccount("acc_alice", "USD", 10000_00L);    // $10,000.00
        seedAccount("acc_bob", "USD", 5000_00L);       // $5,000.00
        seedAccount("acc_charlie", "USD", 2500_00L);   // $2,500.00
        seedAccount("acc_treasury", "USD", 100000_00L); // $100,000.00
    }

    private void seedAccount(String accountId, String currency, long initialBalanceMinorUnits) {
        accountSummaries.put(accountId, AccountSummaryReadModel.builder()
                .accountId(accountId)
                .currency(currency)
                .currentBalanceMinorUnits(initialBalanceMinorUnits)
                .totalInflowMinorUnits(0L)
                .totalOutflowMinorUnits(0L)
                .transactionCount(0L)
                .lastActivityAt(Instant.now())
                .build());
    }

    /**
     * Ingests a settled transaction event into the CQRS read model and fans out to SSE subscribers.
     */
    public PaymentTransactionReadModel ingestSettledEvent(PaymentSettledEvent event) {
        long now = System.currentTimeMillis();
        long createdEpoch = event.getSettledAt() != null ? event.getSettledAt().toEpochMilli() : now;
        long latency = Math.max(1, now - createdEpoch);

        PaymentTransactionReadModel model = PaymentTransactionReadModel.builder()
                .transactionId(event.getTransactionId())
                .idempotencyKey(event.getIdempotencyKey())
                .senderAccountId(event.getSenderAccountId())
                .receiverAccountId(event.getReceiverAccountId())
                .amountMinorUnits(event.getAmountMinorUnits())
                .currency(event.getCurrency())
                .senderBalanceAfterMinorUnits(event.getSenderBalanceAfterMinorUnits())
                .receiverBalanceAfterMinorUnits(event.getReceiverBalanceAfterMinorUnits())
                .journalPostingIds(event.getJournalPostingIds())
                .status("SETTLED")
                .latencyMillis(latency)
                .settledAt(event.getSettledAt() != null ? event.getSettledAt() : Instant.now())
                .build();

        // 1. Update Transaction Index
        transactionsById.put(model.getTransactionId(), model);
        recentTransactions.addFirst(model);
        while (recentTransactions.size() > MAX_RECENT_TRANSACTIONS) {
            recentTransactions.pollLast();
        }

        // 2. Materialize Account Views
        updateAccountSummary(model.getSenderAccountId(), model.getCurrency(),
                model.getSenderBalanceAfterMinorUnits(), 0L, model.getAmountMinorUnits());
        updateAccountSummary(model.getReceiverAccountId(), model.getCurrency(),
                model.getReceiverBalanceAfterMinorUnits(), model.getAmountMinorUnits(), 0L);

        // 3. Update Telemetry Metrics
        totalTransactions.incrementAndGet();
        recentTimestamps.addLast(now);
        recentLatencies.addLast(latency);
        while (recentLatencies.size() > 500) {
            recentLatencies.pollFirst();
        }

        // Track Kafka partition hash
        int partition = Math.abs(event.getSenderAccountId().hashCode()) % KAFKA_PARTITIONS;
        partitionCounters.get(partition).incrementAndGet();

        // 4. SSE Fan-Out to Subscribers
        dispatchToGlobalStream(model);
        dispatchToAccountStream(model.getSenderAccountId(), model);
        dispatchToAccountStream(model.getReceiverAccountId(), model);

        log.debug("Ingested settled event txId={} into CQRS read model", model.getTransactionId());
        return model;
    }

    private void updateAccountSummary(String accountId, String currency, Long newBalance, Long inflowDelta, Long outflowDelta) {
        accountSummaries.compute(accountId, (k, existing) -> {
            if (existing == null) {
                return AccountSummaryReadModel.builder()
                        .accountId(accountId)
                        .currency(currency != null ? currency : "USD")
                        .currentBalanceMinorUnits(newBalance != null ? newBalance : 0L)
                        .totalInflowMinorUnits(inflowDelta)
                        .totalOutflowMinorUnits(outflowDelta)
                        .transactionCount(1L)
                        .lastActivityAt(Instant.now())
                        .build();
            } else {
                if (newBalance != null) {
                    existing.setCurrentBalanceMinorUnits(newBalance);
                }
                existing.setTotalInflowMinorUnits(existing.getTotalInflowMinorUnits() + inflowDelta);
                existing.setTotalOutflowMinorUnits(existing.getTotalOutflowMinorUnits() + outflowDelta);
                existing.setTransactionCount(existing.getTransactionCount() + 1);
                existing.setLastActivityAt(Instant.now());
                return existing;
            }
        });
    }

    // --- SSE Subscription Management ---

    public SseEmitter subscribeToAccountStream(String accountId) {
        SseEmitter emitter = new SseEmitter(1800000L); // 30 minutes
        CopyOnWriteArrayList<SseEmitter> list = accountEmitters.computeIfAbsent(accountId, k -> new CopyOnWriteArrayList<>());
        list.add(emitter);

        emitter.onCompletion(() -> list.remove(emitter));
        emitter.onTimeout(() -> list.remove(emitter));
        emitter.onError(e -> list.remove(emitter));

        // Initial snapshot handshake
        try {
            AccountSummaryReadModel summary = accountSummaries.get(accountId);
            emitter.send(SseEmitter.event()
                    .name("CONNECTED")
                    .data(Map.of(
                            "message", "Subscribed to account stream: " + accountId,
                            "account", summary != null ? summary : Map.of("accountId", accountId),
                            "timestamp", Instant.now().toString()
                    )));
        } catch (IOException e) {
            list.remove(emitter);
        }

        return emitter;
    }

    public SseEmitter subscribeToGlobalLedgerStream() {
        SseEmitter emitter = new SseEmitter(1800000L);
        globalLedgerEmitters.add(emitter);

        emitter.onCompletion(() -> globalLedgerEmitters.remove(emitter));
        emitter.onTimeout(() -> globalLedgerEmitters.remove(emitter));
        emitter.onError(e -> globalLedgerEmitters.remove(emitter));

        try {
            emitter.send(SseEmitter.event()
                    .name("CONNECTED")
                    .data(Map.of(
                            "message", "Subscribed to global settled transactions feed",
                            "cachedCount", recentTransactions.size(),
                            "timestamp", Instant.now().toString()
                    )));
        } catch (IOException e) {
            globalLedgerEmitters.remove(emitter);
        }

        return emitter;
    }

    public SseEmitter subscribeToMetricsStream() {
        SseEmitter emitter = new SseEmitter(1800000L);
        metricsEmitters.add(emitter);

        emitter.onCompletion(() -> metricsEmitters.remove(emitter));
        emitter.onTimeout(() -> metricsEmitters.remove(emitter));
        emitter.onError(e -> metricsEmitters.remove(emitter));

        try {
            emitter.send(SseEmitter.event()
                    .name("CONNECTED")
                    .data(getMetricsSnapshot()));
        } catch (IOException e) {
            metricsEmitters.remove(emitter);
        }

        return emitter;
    }

    private void dispatchToGlobalStream(PaymentTransactionReadModel model) {
        List<SseEmitter> dead = new ArrayList<>();
        for (SseEmitter emitter : globalLedgerEmitters) {
            try {
                emitter.send(SseEmitter.event()
                        .name("SETTLED_TRANSACTION")
                        .data(model));
            } catch (Exception e) {
                dead.add(emitter);
            }
        }
        globalLedgerEmitters.removeAll(dead);
    }

    private void dispatchToAccountStream(String accountId, PaymentTransactionReadModel model) {
        CopyOnWriteArrayList<SseEmitter> list = accountEmitters.get(accountId);
        if (list == null || list.isEmpty()) return;

        List<SseEmitter> dead = new ArrayList<>();
        for (SseEmitter emitter : list) {
            try {
                emitter.send(SseEmitter.event()
                        .name("ACCOUNT_TRANSACTION")
                        .data(model));
            } catch (Exception e) {
                dead.add(emitter);
            }
        }
        list.removeAll(dead);
    }

    @Scheduled(fixedRate = 1000)
    public void broadcastTelemetryTick() {
        if (metricsEmitters.isEmpty()) return;

        SystemMetricSnapshot snapshot = getMetricsSnapshot();
        List<SseEmitter> dead = new ArrayList<>();
        for (SseEmitter emitter : metricsEmitters) {
            try {
                emitter.send(SseEmitter.event()
                        .name("METRICS_SNAPSHOT")
                        .data(snapshot));
            } catch (Exception e) {
                dead.add(emitter);
            }
        }
        metricsEmitters.removeAll(dead);
    }

    @Scheduled(fixedRate = 15000)
    public void sendHeartbeat() {
        // SSE Keep-Alive ping
        Map<String, String> ping = Map.of("type", "HEARTBEAT", "timestamp", Instant.now().toString());
        globalLedgerEmitters.forEach(e -> {
            try { e.send(SseEmitter.event().name("PING").data(ping)); } catch (Exception ignored) {}
        });
        accountEmitters.values().forEach(list -> list.forEach(e -> {
            try { e.send(SseEmitter.event().name("PING").data(ping)); } catch (Exception ignored) {}
        }));
        metricsEmitters.forEach(e -> {
            try { e.send(SseEmitter.event().name("PING").data(ping)); } catch (Exception ignored) {}
        });
    }

    public SystemMetricSnapshot getMetricsSnapshot() {
        long now = System.currentTimeMillis();

        // Calculate TPS across 5-second sliding window
        while (!recentTimestamps.isEmpty() && recentTimestamps.peekFirst() < now - 5000) {
            recentTimestamps.pollFirst();
        }
        double tps = recentTimestamps.size() / 5.0;

        // Calculate latency percentiles
        List<Long> latencies = new ArrayList<>(recentLatencies);
        Collections.sort(latencies);

        double p50 = 0.0, p95 = 0.0, p99 = 0.0;
        if (!latencies.isEmpty()) {
            p50 = latencies.get((int) (latencies.size() * 0.50));
            p95 = latencies.get((int) (latencies.size() * 0.95));
            p99 = latencies.get((int) (latencies.size() * 0.99));
        }

        Map<Integer, Long> distribution = new HashMap<>();
        partitionCounters.forEach((k, v) -> distribution.put(k, v.get()));

        int totalSubscribers = globalLedgerEmitters.size() + metricsEmitters.size() +
                accountEmitters.values().stream().mapToInt(List::size).sum();

        return SystemMetricSnapshot.builder()
                .currentTps(Math.round(tps * 100.0) / 100.0)
                .totalTransactionsProcessed(totalTransactions.get())
                .p50LatencyMillis(p50)
                .p95LatencyMillis(p95)
                .p99LatencyMillis(p99)
                .consumerLag(0L)
                .activeSseSubscribers(totalSubscribers)
                .partitionDistribution(distribution)
                .recordedAt(Instant.now())
                .build();
    }

    // --- Query Methods for REST APIs ---

    public List<PaymentTransactionReadModel> getRecentTransactions(int limit) {
        List<PaymentTransactionReadModel> list = new ArrayList<>();
        int count = 0;
        for (PaymentTransactionReadModel tx : recentTransactions) {
            list.add(tx);
            if (++count >= limit) break;
        }
        return list;
    }

    public Optional<PaymentTransactionReadModel> getTransaction(String txId) {
        return Optional.ofNullable(transactionsById.get(txId));
    }

    public Optional<AccountSummaryReadModel> getAccountSummary(String accountId) {
        return Optional.ofNullable(accountSummaries.get(accountId));
    }

    public Collection<AccountSummaryReadModel> getAllAccounts() {
        return accountSummaries.values();
    }
}
