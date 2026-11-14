package com.enterprise.payments.ledger.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "accounts")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Account {

    @Id
    @Column(length = 64, nullable = false)
    private String id;

    @Column(name = "owner_id", length = 64, nullable = false)
    private String ownerId;

    @Column(length = 3, nullable = false)
    private String currency;

    @Column(precision = 18, scale = 4, nullable = false)
    private BigDecimal balance;

    @Version
    @Column(nullable = false)
    private Long version;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
        if (updatedAt == null) updatedAt = Instant.now();
        if (version == null) version = 0L;
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = Instant.now();
    }
}
