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
