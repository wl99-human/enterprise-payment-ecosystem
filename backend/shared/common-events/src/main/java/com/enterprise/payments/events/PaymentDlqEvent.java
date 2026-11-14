package com.enterprise.payments.events;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * Event published to Dead Letter Queue Kafka topic: payment.dlq
 * Partition Key: transactionId (Partitions: 6)
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class PaymentDlqEvent {

    private String transactionId;
    private String idempotencyKey;
    private String originalTopic;
    private String failureReason;
    private int retryCount;
    private String stackTraceSnippet;
    private Object payload;
    private Instant failedAt;
}
