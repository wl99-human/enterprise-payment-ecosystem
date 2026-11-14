package com.enterprise.payments.ledger.repository;

import com.enterprise.payments.ledger.domain.ProcessedMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ProcessedMessageRepository extends JpaRepository<ProcessedMessage, String> {

    boolean existsByMessageIdAndConsumerGroup(String messageId, String consumerGroup);
}
