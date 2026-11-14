package com.enterprise.payments.ledger.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "processed_messages")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProcessedMessage {

    @Id
    @Column(name = "message_id", length = 128, nullable = false)
    private String messageId;

    @Column(name = "consumer_group", length = 64, nullable = false)
    private String consumerGroup;

    @Column(name = "processed_at", nullable = false)
    private Instant processedAt;
}
