package com.enterprise.payments.notification.controller;

import com.enterprise.payments.events.PaymentSettledEvent;
import com.enterprise.payments.notification.consumer.PaymentSettledConsumer;
import com.enterprise.payments.notification.dlq.DeadLetterQueueManager;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/notifications")
@CrossOrigin(origins = "*")
public class NotificationController {

    private final PaymentSettledConsumer settledConsumer;
    private final DeadLetterQueueManager dlqManager;

    public NotificationController(
            PaymentSettledConsumer settledConsumer,
            DeadLetterQueueManager dlqManager) {
        this.settledConsumer = settledConsumer;
        this.dlqManager = dlqManager;
    }

    @GetMapping("/dispatches")
    public ResponseEntity<?> getDispatches() {
        return ResponseEntity.ok(settledConsumer.getRecentDispatches());
    }

    @GetMapping("/dlq")
    public ResponseEntity<?> getDlqEvents() {
        return ResponseEntity.ok(dlqManager.getRecentDlqEvents());
    }

    @PostMapping("/dlq/replay/{txId}")
    public ResponseEntity<?> replayDlqEvent(@PathVariable String txId) {
        var optEvent = dlqManager.removeEvent(txId);
        if (optEvent.isEmpty()) {
            return ResponseEntity.status(org.springframework.http.HttpStatus.NOT_FOUND).body(Map.of(
                    "error", "DLQ event not found with transactionId: " + txId
            ));
        }

        var event = optEvent.get();
        if (event.getPayload() instanceof PaymentSettledEvent pse) {
            settledConsumer.consumePaymentSettled(pse);
        }

        return ResponseEntity.ok(Map.of(
                "status", "REPLAYED",
                "transactionId", txId,
                "replayedAt", java.time.Instant.now().toString()
        ));
    }

    @PostMapping("/dlq/replay-all")
    public ResponseEntity<?> replayAllDlqEvents() {
        var events = dlqManager.clearAllEvents();
        int replayedCount = 0;
        for (var ev : events) {
            if (ev.getPayload() instanceof PaymentSettledEvent pse) {
                settledConsumer.consumePaymentSettled(pse);
                replayedCount++;
            }
        }
        return ResponseEntity.ok(Map.of(
                "status", "ALL_REPLAYED",
                "replayedCount", replayedCount,
                "timestamp", java.time.Instant.now().toString()
        ));
    }

    @DeleteMapping("/dlq/{txId}")
    public ResponseEntity<?> quarantineDlqEvent(@PathVariable String txId) {
        var opt = dlqManager.removeEvent(txId);
        if (opt.isEmpty()) {
            return ResponseEntity.status(org.springframework.http.HttpStatus.NOT_FOUND).body(Map.of(
                    "error", "DLQ event not found with transactionId: " + txId
            ));
        }
        return ResponseEntity.ok(Map.of(
                "status", "QUARANTINED",
                "transactionId", txId,
                "message", "Poison pill quarantined and permanently evicted from retry pipeline."
        ));
    }

    @PostMapping("/simulate-failure")
    public ResponseEntity<?> toggleFailure(@RequestParam boolean enabled) {
        settledConsumer.setSimulateDownstreamOutage(enabled);
        return ResponseEntity.ok(Map.of(
                "simulateDownstreamOutage", enabled,
                "message", enabled
                        ? "Chaos injection enabled: Downstream notifications will fail and route to payment.dlq"
                        : "Normal operation restored: Notifications will dispatch successfully"
        ));
    }

    @PostMapping("/process-direct")
    public ResponseEntity<?> processDirect(@RequestBody PaymentSettledEvent event) {
        settledConsumer.consumePaymentSettled(event);
        return ResponseEntity.ok(Map.of("status", "PROCESSED", "transactionId", event.getTransactionId()));
    }
}
