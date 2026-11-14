package com.enterprise.payments.analytics.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AccountSummaryReadModel {
    private String accountId;
    private String currency;
    private Long currentBalanceMinorUnits;
    private Long totalInflowMinorUnits;
    private Long totalOutflowMinorUnits;
    private Long transactionCount;
    private Instant lastActivityAt;
}
