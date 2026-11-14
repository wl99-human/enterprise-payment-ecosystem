package com.enterprise.payments.analytics.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentTransactionReadModel {
    private String transactionId;
    private String idempotencyKey;
    private String senderAccountId;
    private String receiverAccountId;
    private Long amountMinorUnits;
    private String currency;
    private Long senderBalanceAfterMinorUnits;
    private Long receiverBalanceAfterMinorUnits;
    private List<Long> journalPostingIds;
    private String status;
    private Long latencyMillis;
    private Instant settledAt;
}
