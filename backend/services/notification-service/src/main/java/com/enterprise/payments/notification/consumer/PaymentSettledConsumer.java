package com.enterprise.payments.notification.consumer;

import com.enterprise.payments.events.PaymentSettledEvent;
import com.enterprise.payments.notification.dlq.DeadLetterQueueManager;
import com.enterprise.payments.notification.retry.ExponentialBackoffJitterWorker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Collections;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

@Component
public class PaymentSettledConsumer {

    private static final Logger log = LoggerFactory.getLogger(PaymentSettledConsumer.class);

    private final ExponentialBackoffJitterWorker retryWorker;
    private final DeadLetterQueueManager dlqManager;
    private final AtomicBoolean simulateDownstreamOutage = new AtomicBoolean(false);
    private final List<Map<String, Object>> dispatchLog = Collections.synchronizedList(new LinkedList<>());

    public PaymentSettledConsumer(
            ExponentialBackoffJitterWorker retryWorker,
            DeadLetterQueueManager dlqManager) {
        this.retryWorker = retryWorker;
        this.dlqManager = dlqManager;
    }

    @KafkaListener(
            topics = "${ecosystem.topics.payment-settled:payment.settled}",
            groupId = "notification-service-group"
    )
    public void consumePaymentSettled(PaymentSettledEvent event) {
        log.info("Notification Service received PaymentSettledEvent: txId={}, sender={}, receiver={}, amount={}",
                event.getTransactionId(), event.getSenderAccountId(), event.getReceiverAccountId(), event.getAmountMinorUnits());

        try {
            retryWorker.executeWithRetry("dispatch-notification-" + event.getTransactionId(), () -> {
                if (simulateDownstreamOutage.get()) {
                    throw new RuntimeException("Simulated 503 Service Unavailable downstream payment gateway error");
                }

                // Simulate successful push / webhook dispatch
                Map<String, Object> dispatchRecord = Map.of(
                        "transactionId", event.getTransactionId(),
                        "recipient", event.getReceiverAccountId(),
                        "amountMinorUnits", event.getAmountMinorUnits(),
                        "currency", event.getCurrency(),
                        "status", "DELIVERED_SUCCESSFULLY",
                        "dispatchedAt", Instant.now().toString()
                );
                dispatchLog.add(0, dispatchRecord);
                if (dispatchLog.size() > 500) {
                    dispatchLog.remove(dispatchLog.size() - 1);
                }

                log.info("Dispatched live push receipt for txId={}", event.getTransactionId());
                return true;
            });
        } catch (Exception ex) {
            log.error("Exhausted retries for txId={}. Forwarding event to DLQ topic.", event.getTransactionId());
            dlqManager.routeToDlq(event, ex, retryWorker.getMaxAttempts());
        }
    }

    public void setSimulateDownstreamOutage(boolean simulate) {
        this.simulateDownstreamOutage.set(simulate);
    }

    public boolean isSimulatingOutage() {
        return simulateDownstreamOutage.get();
    }

    public List<Map<String, Object>> getRecentDispatches() {
        return List.copyOf(dispatchLog);
    }
}
