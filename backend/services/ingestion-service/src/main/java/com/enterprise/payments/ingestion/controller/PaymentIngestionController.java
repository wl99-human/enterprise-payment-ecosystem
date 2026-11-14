package com.enterprise.payments.ingestion.controller;

import com.enterprise.payments.dsa.FxRoutingDag;
import com.enterprise.payments.events.PaymentInitEvent;
import com.enterprise.payments.ingestion.dto.TransferRequest;
import com.enterprise.payments.ingestion.dto.TransferResponse;
import com.enterprise.payments.ingestion.idempotency.IdempotencyFastPathService;
import com.enterprise.payments.ingestion.queue.PaymentIngestionQueue;
import com.enterprise.payments.ingestion.security.HmacSignatureValidator;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/payments")
@CrossOrigin(origins = "*")
public class PaymentIngestionController {

    private final IdempotencyFastPathService idempotencyService;
    private final PaymentIngestionQueue ingestionQueue;
    private final HmacSignatureValidator signatureValidator;
    private final FxRoutingDag fxDag;

    public PaymentIngestionController(
            IdempotencyFastPathService idempotencyService,
            PaymentIngestionQueue ingestionQueue,
            HmacSignatureValidator signatureValidator) {
        this.idempotencyService = idempotencyService;
        this.ingestionQueue = ingestionQueue;
        this.signatureValidator = signatureValidator;

        // Initialize FX Liquidity Graph
        this.fxDag = new FxRoutingDag();
        this.fxDag.addLiquidityPair("USD", "EUR", 0.005, 0.92);
        this.fxDag.addLiquidityPair("EUR", "USD", 0.005, 1.087);
        this.fxDag.addLiquidityPair("USD", "GBP", 0.008, 0.79);
        this.fxDag.addLiquidityPair("GBP", "USD", 0.008, 1.265);
        this.fxDag.addLiquidityPair("EUR", "JPY", 0.007, 168.0);
        this.fxDag.addLiquidityPair("USD", "JPY", 0.030, 155.0); // Direct has higher fee (3.0%)
        this.fxDag.addLiquidityPair("USD", "SGD", 0.006, 1.34);
    }

    @PostMapping("/transfer")
    public ResponseEntity<?> initiateTransfer(
            @RequestHeader(value = "X-Idempotency-Key", required = false) String idempotencyKey,
            @RequestHeader(value = "X-Signature", required = false) String signature,
            @Valid @RequestBody TransferRequest request) {

        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Missing required header 'X-Idempotency-Key'"
            ));
        }

        // 1. Signature Verification
        String payloadString = request.toString();
        if (!signatureValidator.isValidSignature(payloadString, signature)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of(
                    "error", "Invalid HMAC-SHA256 Request Signature"
            ));
        }

        // 2. Fast-Path Bloom Filter Deduplication Check
        if (!idempotencyService.isDefinitivelyNewKey(idempotencyKey)) {
            // Bloom filter hit -> Check if response cached
            TransferResponse cached = idempotencyService.getCachedResponse(idempotencyKey);
            if (cached != null) {
                return ResponseEntity.ok(cached);
            }
            if (idempotencyService.isCurrentlyProcessing(idempotencyKey)) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
                        "error", "Concurrent transaction with the same Idempotency-Key is currently in-flight",
                        "idempotencyKey", idempotencyKey
                ));
            }
        }

        // 3. Acquire Distributed Mutex Lock (Fast path Redis / in-memory)
        String transactionId = "tx_" + UUID.randomUUID();
        boolean lockAcquired = idempotencyService.tryAcquireMutexLock(idempotencyKey, transactionId);
        if (!lockAcquired) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
                    "error", "Duplicate in-flight lock collision detected",
                    "idempotencyKey", idempotencyKey
            ));
        }

        // 4. Construct Event & Enqueue into Lock-Free RingBuffer for Kafka publication
        PaymentInitEvent event = PaymentInitEvent.builder()
                .transactionId(transactionId)
                .idempotencyKey(idempotencyKey)
                .senderAccountId(request.getSenderAccountId())
                .receiverAccountId(request.getReceiverAccountId())
                .amountMinorUnits(request.getAmountMinorUnits())
                .currency(request.getCurrency())
                .payloadHash(HmacSignatureValidator.computePayloadHash(payloadString))
                .createdAt(Instant.now())
                .build();

        ingestionQueue.enqueue(event);

        TransferResponse response = TransferResponse.builder()
                .transactionId(transactionId)
                .idempotencyKey(idempotencyKey)
                .status("ACCEPTED")
                .message("Payment transaction ingested into Kafka backbone (Topic: payment.init)")
                .senderAccountId(request.getSenderAccountId())
                .receiverAccountId(request.getReceiverAccountId())
                .amountMinorUnits(request.getAmountMinorUnits())
                .currency(request.getCurrency())
                .timestamp(Instant.now())
                .build();

        idempotencyService.markCommitted(idempotencyKey, response);

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
    }

    @GetMapping("/routes")
    public ResponseEntity<?> getOptimalFxRoute(
            @RequestParam(defaultValue = "USD") String from,
            @RequestParam(defaultValue = "JPY") String to) {

        Optional<FxRoutingDag.RoutingPath> optimalRoute = fxDag.findOptimalPath(from, to);
        if (optimalRoute.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
                    "error", "No liquidity route available between " + from + " and " + to
            ));
        }
        return ResponseEntity.ok(optimalRoute.get());
    }

    @GetMapping("/health")
    public ResponseEntity<?> health() {
        return ResponseEntity.ok(Map.of(
                "service", "ingestion-service",
                "status", "UP",
                "ringBufferQueueDepth", ingestionQueue.getQueueDepth(),
                "timestamp", Instant.now().toString()
        ));
    }
}
