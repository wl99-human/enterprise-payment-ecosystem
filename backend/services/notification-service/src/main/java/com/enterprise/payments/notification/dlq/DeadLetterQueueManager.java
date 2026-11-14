package com.enterprise.payments.notification.dlq;

import com.enterprise.payments.events.PaymentDlqEvent;
import com.enterprise.payments.events.PaymentSettledEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Collections;
import java.util.LinkedList;
import java.util.List;

@Component
public class DeadLetterQueueManager {

    private static final Logger log = LoggerFactory.getLogger(DeadLetterQueueManager.class);

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final String dlqTopic;
    private final List<PaymentDlqEvent> localDlqStore = Collections.synchronizedList(new LinkedList<>());

    public DeadLetterQueueManager(
            @Autowired(required = false) KafkaTemplate<String, Object> kafkaTemplate,
            @Value("${ecosystem.topics.payment-dlq:payment.dlq}") String dlqTopic) {
        this.kafkaTemplate = kafkaTemplate;
        this.dlqTopic = dlqTopic;
    }

    public void routeToDlq(PaymentSettledEvent event, Exception exception, int attemptsMade) {
        String txId = event.getTransactionId();
        PaymentDlqEvent dlqEvent = PaymentDlqEvent.builder()
                .transactionId(txId)
                .idempotencyKey(event.getIdempotencyKey())
                .originalTopic("payment.settled")
                .failureReason(exception.getMessage() != null ? exception.getMessage() : "Downstream dispatch failure")
                .retryCount(attemptsMade)
                .stackTraceSnippet(exception.getClass().getSimpleName())
                .payload(event)
                .failedAt(Instant.now())
                .build();

        localDlqStore.add(0, dlqEvent);
        if (localDlqStore.size() > 500) {
            localDlqStore.remove(localDlqStore.size() - 1);
        }

        if (kafkaTemplate != null) {
            try {
                // Partition key: transactionId (Partitions: 6)
                kafkaTemplate.send(dlqTopic, txId, dlqEvent);
                log.warn("Routed event txId={} to DLQ topic: {}", txId, dlqTopic);
            } catch (Exception ex) {
                log.error("Failed to publish DLQ event to Kafka topic: {}", dlqTopic, ex);
            }
        } else {
            log.warn("Standalone mode: stored event in local DLQ registry for txId={}", txId);
        }
    }

    public List<PaymentDlqEvent> getRecentDlqEvents() {
        return List.copyOf(localDlqStore);
    }
}
