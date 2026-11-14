package com.enterprise.payments.events;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * Event published to Kafka topic: payment.init
 * Partition Key: senderAccountId (Ensures strict FIFO ordering per account across 12 partitions)
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class PaymentInitEvent {

    private String transactionId;
    private String idempotencyKey;
    private String senderAccountId;
    private String receiverAccountId;
    private long amountMinorUnits;
    private String currency;
    private String payloadHash;
    private String clientIp;
    private Instant createdAt;
}
