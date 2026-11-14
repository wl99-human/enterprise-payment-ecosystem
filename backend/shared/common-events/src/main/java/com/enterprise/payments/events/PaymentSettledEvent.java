package com.enterprise.payments.events;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

/**
 * Event published to Kafka topic: payment.settled
 * Partition Key: senderAccountId
 * Published reliably via the Transactional Outbox Worker using SELECT ... FOR UPDATE SKIP LOCKED
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class PaymentSettledEvent {

    private String transactionId;
    private String idempotencyKey;
    private String senderAccountId;
    private String receiverAccountId;
    private long amountMinorUnits;
    private String currency;
    private long senderBalanceAfterMinorUnits;
    private long receiverBalanceAfterMinorUnits;
    private List<Long> journalPostingIds;
    private Instant settledAt;
}
