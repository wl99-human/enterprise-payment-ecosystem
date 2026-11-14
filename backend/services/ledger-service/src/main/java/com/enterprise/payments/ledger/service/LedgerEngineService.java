package com.enterprise.payments.ledger.service;

import com.enterprise.payments.events.PaymentInitEvent;
import com.enterprise.payments.events.PaymentSettledEvent;
import com.enterprise.payments.ledger.domain.*;
import com.enterprise.payments.ledger.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class LedgerEngineService {

    private static final Logger log = LoggerFactory.getLogger(LedgerEngineService.class);
    private static final String CONSUMER_GROUP = "ledger-service-group";

    private final AccountRepository accountRepository;
    private final JournalEntryRepository journalEntryRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final ProcessedMessageRepository processedMessageRepository;
    private final ObjectMapper objectMapper;

    public LedgerEngineService(
            AccountRepository accountRepository,
            JournalEntryRepository journalEntryRepository,
            OutboxEventRepository outboxEventRepository,
            ProcessedMessageRepository processedMessageRepository,
            ObjectMapper objectMapper) {
        this.accountRepository = accountRepository;
        this.journalEntryRepository = journalEntryRepository;
        this.outboxEventRepository = outboxEventRepository;
        this.processedMessageRepository = processedMessageRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * Executes double-entry payment settlement inside a single ACID transactional boundary.
     * Enforces lexicographical row locking, balance availability invariant,
     * debit == credit balance conservation, and atomic outbox event staging.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public PaymentSettledEvent processPaymentInit(PaymentInitEvent event) {
        String txId = event.getTransactionId();
        String messageKey = "msg_" + txId;

        // 1. Consumer Idempotency Pre-Check
        if (processedMessageRepository.existsByMessageIdAndConsumerGroup(messageKey, CONSUMER_GROUP)) {
            log.info("Duplicate Kafka message detected. Skipping transaction: {}", txId);
            return null;
        }

        String senderId = event.getSenderAccountId();
        String receiverId = event.getReceiverAccountId();

        if (senderId.equals(receiverId)) {
            throw new IllegalArgumentException("Self-transfer prohibited: sender and receiver must differ");
        }

        // 2. Deadlock-Free Lexicographical Row Locking
        List<String> accountIdsToLock = new ArrayList<>(List.of(senderId, receiverId));
        accountIdsToLock.sort(String::compareTo); // Enforce alphabetical ordering
        List<Account> lockedAccounts = accountRepository.findAccountsForUpdateOrdered(accountIdsToLock);

        Map<String, Account> accountMap = lockedAccounts.stream()
                .collect(Collectors.toMap(Account::getId, a -> a));

        Account sender = accountMap.get(senderId);
        Account receiver = accountMap.get(receiverId);

        if (sender == null) throw new IllegalArgumentException("Sender account not found: " + senderId);
        if (receiver == null) throw new IllegalArgumentException("Receiver account not found: " + receiverId);

        BigDecimal transferAmount = BigDecimal.valueOf(event.getAmountMinorUnits())
                .divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP);

        // 3. Balance Availability Invariant Validation
        if (sender.getBalance().compareTo(transferAmount) < 0) {
            log.warn("Insufficient funds for account {}: balance={}, requested={}",
                    senderId, sender.getBalance(), transferAmount);
            throw new IllegalStateException("Insufficient funds in account: " + senderId);
        }

        // 4. Double-Entry Balance Mutation
        sender.setBalance(sender.getBalance().subtract(transferAmount));
        receiver.setBalance(receiver.getBalance().add(transferAmount));
        accountRepository.save(sender);
        accountRepository.save(receiver);

        // 5. Journal Entries Recording (Conservation: Debits == Credits)
        JournalEntry debitEntry = JournalEntry.builder()
                .transactionId(txId)
                .accountId(senderId)
                .direction(PostingDirection.DEBIT)
                .amount(transferAmount)
                .currency(event.getCurrency())
                .createdAt(Instant.now())
                .build();

        JournalEntry creditEntry = JournalEntry.builder()
                .transactionId(txId)
                .accountId(receiverId)
                .direction(PostingDirection.CREDIT)
                .amount(transferAmount)
                .currency(event.getCurrency())
                .createdAt(Instant.now())
                .build();

        JournalEntry savedDebit = journalEntryRepository.save(debitEntry);
        JournalEntry savedCredit = journalEntryRepository.save(creditEntry);

        // 6. Stage Event in Transactional Outbox
        long senderBalanceAfter = sender.getBalance().multiply(BigDecimal.valueOf(100)).longValue();
        long receiverBalanceAfter = receiver.getBalance().multiply(BigDecimal.valueOf(100)).longValue();

        PaymentSettledEvent settledEvent = PaymentSettledEvent.builder()
                .transactionId(txId)
                .idempotencyKey(event.getIdempotencyKey())
                .senderAccountId(senderId)
                .receiverAccountId(receiverId)
                .amountMinorUnits(event.getAmountMinorUnits())
                .currency(event.getCurrency())
                .senderBalanceAfterMinorUnits(senderBalanceAfter)
                .receiverBalanceAfterMinorUnits(receiverBalanceAfter)
                .journalPostingIds(List.of(savedDebit.getId(), savedCredit.getId()))
                .settledAt(Instant.now())
                .build();

        try {
            String payloadJson = objectMapper.writeValueAsString(settledEvent);
            OutboxEvent outboxEvent = OutboxEvent.builder()
                    .aggregateType("PAYMENT")
                    .aggregateId(txId)
                    .eventType("payment.settled")
                    .payload(payloadJson)
                    .status(OutboxStatus.PENDING)
                    .retryCount(0)
                    .createdAt(Instant.now())
                    .updatedAt(Instant.now())
                    .build();
            outboxEventRepository.save(outboxEvent);
        } catch (Exception e) {
            throw new RuntimeException("Failed to serialize outbox event payload", e);
        }

        // 7. Record Ingestion Idempotency Marker
        ProcessedMessage processedMessage = ProcessedMessage.builder()
                .messageId(messageKey)
                .consumerGroup(CONSUMER_GROUP)
                .processedAt(Instant.now())
                .build();
        processedMessageRepository.save(processedMessage);

        log.info("Ledger transaction settled: txId={}, sender={}, receiver={}, amount={}{}",
                txId, senderId, receiverId, transferAmount, event.getCurrency());

        return settledEvent;
    }
}
