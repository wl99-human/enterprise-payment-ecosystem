package com.enterprise.payments.ingestion.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TransferRequest {

    @NotBlank(message = "senderAccountId is required")
    private String senderAccountId;

    @NotBlank(message = "receiverAccountId is required")
    private String receiverAccountId;

    @Positive(message = "amount must be greater than zero")
    private long amountMinorUnits;

    @NotBlank(message = "currency is required")
    private String currency;

    private String description;
}
