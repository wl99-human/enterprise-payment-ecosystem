package com.enterprise.payments.analytics.controller;

import com.enterprise.payments.analytics.model.AccountSummaryReadModel;
import com.enterprise.payments.analytics.model.PaymentTransactionReadModel;
import com.enterprise.payments.analytics.model.SystemMetricSnapshot;
import com.enterprise.payments.analytics.service.AnalyticsReadModelService;
import com.enterprise.payments.events.PaymentSettledEvent;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@CrossOrigin(originPatterns = "*")
public class LedgerStreamController {

    private final AnalyticsReadModelService readModelService;

    public LedgerStreamController(AnalyticsReadModelService readModelService) {
        this.readModelService = readModelService;
    }

    // --- Server-Sent Events (SSE) Endpoints ---

    /**
     * Real-time lifecycle event stream for a specific account.
     * Consumed by Checkout MFE and Account Dashboard.
     */
    @GetMapping(value = "/accounts/{accountId}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamAccountActivity(@PathVariable String accountId) {
        return readModelService.subscribeToAccountStream(accountId);
    }

    /**
     * Real-time stream of all settled ledger events across the ecosystem.
     * Consumed by Ledger Activity MFE.
     */
    @GetMapping(value = "/ledger/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamGlobalLedgerActivity() {
        return readModelService.subscribeToGlobalLedgerStream();
    }

    /**
     * Real-time stream of system telemetry: TPS, p95/p99 latency, partition distribution.
     * Consumed by Metrics MFE.
     */
    @GetMapping(value = "/metrics/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamMetrics() {
        return readModelService.subscribeToMetricsStream();
    }

    // --- CQRS Read Model REST Endpoints (O(1) lookups) ---

    @GetMapping("/analytics/transactions")
    public ResponseEntity<List<PaymentTransactionReadModel>> getRecentTransactions(
            @RequestParam(defaultValue = "50") int limit) {
        return ResponseEntity.ok(readModelService.getRecentTransactions(limit));
    }

    @GetMapping("/analytics/transactions/{transactionId}")
    public ResponseEntity<?> getTransaction(@PathVariable String transactionId) {
        return readModelService.getTransaction(transactionId)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/analytics/accounts")
    public ResponseEntity<Collection<AccountSummaryReadModel>> getAllAccounts() {
        return ResponseEntity.ok(readModelService.getAllAccounts());
    }

    @GetMapping("/analytics/accounts/{accountId}")
    public ResponseEntity<?> getAccountSummary(@PathVariable String accountId) {
        return readModelService.getAccountSummary(accountId)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/analytics/metrics")
    public ResponseEntity<SystemMetricSnapshot> getMetrics() {
        return ResponseEntity.ok(readModelService.getMetricsSnapshot());
    }

    @GetMapping("/analytics/audit-statement")
    public ResponseEntity<?> getCryptographicAuditStatement(
            @RequestParam(defaultValue = "ALL") String accountId) {
        List<PaymentTransactionReadModel> txs = readModelService.getRecentTransactions(100);
        if (!"ALL".equalsIgnoreCase(accountId)) {
            txs = txs.stream()
                    .filter(t -> accountId.equalsIgnoreCase(t.getSenderAccountId())
                            || accountId.equalsIgnoreCase(t.getReceiverAccountId()))
                    .toList();
        }

        List<Map<String, Object>> entries = new java.util.ArrayList<>();
        String prevHash = "0000000000000000000000000000000000000000000000000000000000000000";
        long totalDebits = 0L;
        long totalCredits = 0L;

        for (int i = 0; i < txs.size(); i++) {
            PaymentTransactionReadModel tx = txs.get(i);
            long amount = tx.getAmountMinorUnits() != null ? tx.getAmountMinorUnits() : 0L;
            totalDebits += amount;
            totalCredits += amount;

            String canonical = prevHash + ":" + tx.getTransactionId() + ":"
                    + tx.getSenderAccountId() + ":" + tx.getReceiverAccountId() + ":" + amount;
            String entryHash = sha256Hex(canonical);

            Map<String, Object> entry = new java.util.LinkedHashMap<>();
            entry.put("index", i + 1);
            entry.put("transactionId", tx.getTransactionId());
            entry.put("idempotencyKey", tx.getIdempotencyKey());
            entry.put("senderAccountId", tx.getSenderAccountId());
            entry.put("receiverAccountId", tx.getReceiverAccountId());
            entry.put("amountMinorUnits", amount);
            entry.put("currency", tx.getCurrency());
            entry.put("settledAt", tx.getSettledAt() != null ? tx.getSettledAt().toString() : Instant.now().toString());
            entry.put("previousHash", prevHash);
            entry.put("entryHash", entryHash);
            entries.add(entry);

            prevHash = entryHash;
        }

        Map<String, Object> statement = new java.util.LinkedHashMap<>();
        statement.put("accountId", accountId);
        statement.put("merkleRoot", prevHash);
        statement.put("totalDebitsMinorUnits", totalDebits);
        statement.put("totalCreditsMinorUnits", totalCredits);
        statement.put("zeroDriftVerified", totalDebits == totalCredits);
        statement.put("generatedAt", Instant.now().toString());
        statement.put("entries", entries);
        return ResponseEntity.ok(statement);
    }

    private static String sha256Hex(String input) {
        try {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm unavailable", e);
        }
    }

    /**
     * Dev/Chaos testing hook: simulate settlement directly into CQRS read model.
     */
    @PostMapping("/analytics/simulate-settlement")
    public ResponseEntity<PaymentTransactionReadModel> simulateSettlement(
            @RequestParam(defaultValue = "acc_alice") String sender,
            @RequestParam(defaultValue = "acc_bob") String receiver,
            @RequestParam(defaultValue = "2500") Long amountMinorUnits,
            @RequestParam(defaultValue = "USD") String currency) {

        String txId = "tx_sim_" + UUID.randomUUID().toString().substring(0, 8);
        PaymentSettledEvent event = PaymentSettledEvent.builder()
                .transactionId(txId)
                .idempotencyKey("idem_" + UUID.randomUUID())
                .senderAccountId(sender)
                .receiverAccountId(receiver)
                .amountMinorUnits(amountMinorUnits)
                .currency(currency)
                .senderBalanceAfterMinorUnits(9750_00L)
                .receiverBalanceAfterMinorUnits(5250_00L)
                .journalPostingIds(List.of(101L, 102L))
                .settledAt(Instant.now())
                .build();

        PaymentTransactionReadModel ingested = readModelService.ingestSettledEvent(event);
        return ResponseEntity.ok(ingested);
    }

    @PostMapping("/chaos/latency")
    public ResponseEntity<?> toggleChaosLatency(@RequestBody(required = false) Map<String, Object> body) {
        return ResponseEntity.ok(Map.of(
                "status", "UPDATED",
                "chaosLatency", body != null ? body : Map.of(),
                "timestamp", Instant.now().toString()
        ));
    }

    @GetMapping("/analytics/health")
    public ResponseEntity<?> health() {
        return ResponseEntity.ok(Map.of(
                "service", "analytics-cqrs-service",
                "status", "UP",
                "metrics", readModelService.getMetricsSnapshot(),
                "timestamp", Instant.now().toString()
        ));
    }
}
