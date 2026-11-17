package com.enterprise.payments.ledger.controller;

import com.enterprise.payments.events.PaymentInitEvent;
import com.enterprise.payments.events.PaymentSettledEvent;
import com.enterprise.payments.ledger.domain.Account;
import com.enterprise.payments.ledger.domain.JournalEntry;
import com.enterprise.payments.ledger.domain.OutboxEvent;
import com.enterprise.payments.ledger.domain.OutboxStatus;
import com.enterprise.payments.ledger.repository.AccountRepository;
import com.enterprise.payments.ledger.repository.JournalEntryRepository;
import com.enterprise.payments.ledger.repository.OutboxEventRepository;
import com.enterprise.payments.ledger.service.LedgerEngineService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
@CrossOrigin(origins = "*")
public class LedgerController {

    private final AccountRepository accountRepository;
    private final JournalEntryRepository journalEntryRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final LedgerEngineService ledgerEngineService;

    public LedgerController(
            AccountRepository accountRepository,
            JournalEntryRepository journalEntryRepository,
            OutboxEventRepository outboxEventRepository,
            LedgerEngineService ledgerEngineService) {
        this.accountRepository = accountRepository;
        this.journalEntryRepository = journalEntryRepository;
        this.outboxEventRepository = outboxEventRepository;
        this.ledgerEngineService = ledgerEngineService;
    }

    @GetMapping("/accounts")
    public ResponseEntity<List<Account>> listAccounts() {
        return ResponseEntity.ok(accountRepository.findAll());
    }

    @GetMapping("/accounts/{id}")
    public ResponseEntity<?> getAccount(@PathVariable String id) {
        return accountRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/ledger/journal")
    public ResponseEntity<List<JournalEntry>> listJournalEntries() {
        return ResponseEntity.ok(journalEntryRepository.findTop100ByOrderByCreatedAtDesc());
    }

    @GetMapping("/ledger/outbox")
    public ResponseEntity<?> listOutboxEvents() {
        List<OutboxEvent> events = outboxEventRepository.findTop50ByOrderByCreatedAtDesc();
        Map<String, Object> response = new java.util.LinkedHashMap<>();
        response.put("events", events);
        response.put("pendingCount", outboxEventRepository.countByStatus(OutboxStatus.PENDING));
        response.put("publishedCount", outboxEventRepository.countByStatus(OutboxStatus.PUBLISHED));
        response.put("failedCount", outboxEventRepository.countByStatus(OutboxStatus.FAILED));
        response.put("pollerIntervalMs", 200);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/ledger/audit")
    public ResponseEntity<?> auditDoubleEntryConservation() {
        BigDecimal totalDebits = journalEntryRepository.calculateTotalDebits();
        BigDecimal totalCredits = journalEntryRepository.calculateTotalCredits();
        boolean isConserved = totalDebits.compareTo(totalCredits) == 0;

        return ResponseEntity.ok(Map.of(
                "status", isConserved ? "HEALTHY_100_PERCENT_CONSERVED" : "INVARIANT_VIOLATION",
                "totalDebits", totalDebits,
                "totalCredits", totalCredits,
                "discrepancy", totalDebits.subtract(totalCredits).abs(),
                "totalAccountsAudited", accountRepository.count(),
                "totalJournalEntriesAudited", journalEntryRepository.count(),
                "auditedAt", Instant.now().toString()
        ));
    }

    @PostMapping("/ledger/seed")
    public ResponseEntity<?> seedInitialAccounts() {
        if (accountRepository.count() > 0) {
            return ResponseEntity.ok(Map.of("message", "Accounts already exist", "count", accountRepository.count()));
        }

        List<Account> genesisAccounts = List.of(
                Account.builder().id("acc_alice_01").ownerId("usr_alice").currency("USD").balance(new BigDecimal("10000.0000")).build(),
                Account.builder().id("acc_bob_02").ownerId("usr_bob").currency("USD").balance(new BigDecimal("5000.0000")).build(),
                Account.builder().id("acc_charlie_03").ownerId("usr_charlie").currency("USD").balance(new BigDecimal("7500.0000")).build(),
                Account.builder().id("acc_merchant_prime").ownerId("org_merchant").currency("USD").balance(new BigDecimal("25000.0000")).build(),
                Account.builder().id("acc_treasury_vault").ownerId("org_treasury").currency("USD").balance(new BigDecimal("1000000.0000")).build()
        );

        accountRepository.saveAll(genesisAccounts);

        return ResponseEntity.ok(Map.of(
                "status", "INITIALIZED",
                "seededCount", genesisAccounts.size(),
                "accounts", genesisAccounts
        ));
    }

    @PostMapping("/ledger/process-direct")
    public ResponseEntity<?> processDirect(@RequestBody PaymentInitEvent event) {
        PaymentSettledEvent settled = ledgerEngineService.processPaymentInit(event);
        return ResponseEntity.ok(settled);
    }
}
