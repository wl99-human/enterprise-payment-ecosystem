package com.enterprise.payments.ingestion.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TransferResponse {

    private String transactionId;
    private String idempotencyKey;
    private String status; // ACCEPTED, CACHED_REPLAY, FAILED
    private String message;
    private String senderAccountId;
    private String receiverAccountId;
    private long amountMinorUnits;
    private String currency;
    private Instant timestamp;
}
