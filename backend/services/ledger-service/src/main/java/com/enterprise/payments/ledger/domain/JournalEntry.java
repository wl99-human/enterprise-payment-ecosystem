package com.enterprise.payments.ledger.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "journal_entries", indexes = {
        @Index(name = "idx_journal_tx", columnList = "transaction_id"),
        @Index(name = "idx_journal_account", columnList = "account_id, created_at DESC")
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JournalEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "transaction_id", length = 64, nullable = false)
    private String transactionId;

    @Column(name = "account_id", length = 64, nullable = false)
    private String accountId;

    @Enumerated(EnumType.STRING)
    @Column(length = 6, nullable = false)
    private PostingDirection direction;

    @Column(precision = 18, scale = 4, nullable = false)
    private BigDecimal amount;

    @Column(length = 3, nullable = false)
    private String currency;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
