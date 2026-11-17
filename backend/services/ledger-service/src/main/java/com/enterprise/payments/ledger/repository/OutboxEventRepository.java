package com.enterprise.payments.ledger.repository;

import com.enterprise.payments.ledger.domain.OutboxEvent;
import com.enterprise.payments.ledger.domain.OutboxStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface OutboxEventRepository extends JpaRepository<OutboxEvent, UUID> {

    List<OutboxEvent> findTop100ByStatusOrderByCreatedAtAsc(OutboxStatus status);

    List<OutboxEvent> findTop50ByOrderByCreatedAtDesc();

    long countByStatus(OutboxStatus status);
}
