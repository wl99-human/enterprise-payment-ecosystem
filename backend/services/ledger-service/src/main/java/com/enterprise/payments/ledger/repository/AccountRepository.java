package com.enterprise.payments.ledger.repository;

import com.enterprise.payments.ledger.domain.Account;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AccountRepository extends JpaRepository<Account, String> {

    /**
     * Deadlock-Free Pessimistic Row Locking:
     * Acquires PESSIMISTIC_WRITE lock while enforcing strict lexicographical ordering (ORDER BY a.id ASC).
     * This guarantees that bidirectional transfers (A -> B and B -> A) acquire locks in identical order,
     * completely eliminating circular wait conditions and distributed database deadlocks.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM Account a WHERE a.id IN :ids ORDER BY a.id ASC")
    List<Account> findAccountsForUpdateOrdered(@Param("ids") List<String> ids);
}
