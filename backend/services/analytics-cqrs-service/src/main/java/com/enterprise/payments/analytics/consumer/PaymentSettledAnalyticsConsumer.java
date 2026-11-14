package com.enterprise.payments.analytics.consumer;

import com.enterprise.payments.analytics.service.AnalyticsReadModelService;
import com.enterprise.payments.events.PaymentSettledEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
public class PaymentSettledAnalyticsConsumer {

    private static final Logger log = LoggerFactory.getLogger(PaymentSettledAnalyticsConsumer.class);

    private final AnalyticsReadModelService readModelService;

    public PaymentSettledAnalyticsConsumer(AnalyticsReadModelService readModelService) {
        this.readModelService = readModelService;
    }

    @KafkaListener(
            topics = "${ecosystem.topics.payment-settled:payment.settled}",
            groupId = "analytics-cqrs-group"
    )
    public void consumePaymentSettled(PaymentSettledEvent event) {
        log.info("Analytics CQRS received PaymentSettledEvent: txId={}, sender={}, receiver={}, amount={}",
                event.getTransactionId(), event.getSenderAccountId(), event.getReceiverAccountId(), event.getAmountMinorUnits());

        readModelService.ingestSettledEvent(event);
    }
}
