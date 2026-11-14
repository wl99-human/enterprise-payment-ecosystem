package com.enterprise.payments.ledger.repository;

import com.enterprise.payments.ledger.domain.JournalEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;

@Repository
public interface JournalEntryRepository extends JpaRepository<JournalEntry, Long> {

    List<JournalEntry> findByTransactionId(String transactionId);

    List<JournalEntry> findTop100ByOrderByCreatedAtDesc();

    @Query("SELECT COALESCE(SUM(j.amount), 0) FROM JournalEntry j WHERE j.direction = 'DEBIT'")
    BigDecimal calculateTotalDebits();

    @Query("SELECT COALESCE(SUM(j.amount), 0) FROM JournalEntry j WHERE j.direction = 'CREDIT'")
    BigDecimal calculateTotalCredits();
}
