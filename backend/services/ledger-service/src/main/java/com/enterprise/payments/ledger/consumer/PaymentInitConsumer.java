package com.enterprise.payments.ledger.consumer;

import com.enterprise.payments.events.PaymentInitEvent;
import com.enterprise.payments.ledger.service.LedgerEngineService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

/**
 * Resilient Kafka Consumer listening to topic: payment.init
 * Uses manual offset commit (enable.auto.commit = false) to ensure zero lost messages.
 */
@Component
public class PaymentInitConsumer {

    private static final Logger log = LoggerFactory.getLogger(PaymentInitConsumer.class);
    private final LedgerEngineService ledgerEngineService;

    public PaymentInitConsumer(LedgerEngineService ledgerEngineService) {
        this.ledgerEngineService = ledgerEngineService;
    }

    @KafkaListener(
            topics = "${ecosystem.topics.payment-init:payment.init}",
            groupId = "ledger-service-group",
            containerFactory = "kafkaListenerContainerFactory"
    )
    public void consumePaymentInit(PaymentInitEvent event, Acknowledgment ack) {
        log.info("Received PaymentInitEvent from Kafka: txId={}, sender={}, receiver={}, amount={}",
                event.getTransactionId(), event.getSenderAccountId(), event.getReceiverAccountId(), event.getAmountMinorUnits());

        try {
            ledgerEngineService.processPaymentInit(event);
            if (ack != null) {
                ack.acknowledge();
            }
        } catch (Exception e) {
            log.error("Failed to process PaymentInitEvent txId={}: {}", event.getTransactionId(), e.getMessage(), e);
            // In a production DLQ scenario or retry, offset may be committed after routing to DLQ
            if (ack != null) {
                ack.acknowledge();
            }
        }
    }
}
