package com.enterprise.payments.analytics.service;

import com.enterprise.payments.analytics.model.AccountSummaryReadModel;
import com.enterprise.payments.analytics.model.PaymentTransactionReadModel;
import com.enterprise.payments.analytics.model.SystemMetricSnapshot;
import com.enterprise.payments.events.PaymentSettledEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class AnalyticsReadModelServiceTest {

    private AnalyticsReadModelService service;

    @BeforeEach
    void setUp() {
        service = new AnalyticsReadModelService();
    }

    @Test
    void shouldIngestSettledEventAndUpdateMaterializedModels() {
        PaymentSettledEvent event = PaymentSettledEvent.builder()
                .transactionId("tx_1001")
                .idempotencyKey("idem_1001")
                .senderAccountId("acc_alice")
                .receiverAccountId("acc_bob")
                .amountMinorUnits(1500L) // $15.00
                .currency("USD")
                .senderBalanceAfterMinorUnits(9985_00L)
                .receiverBalanceAfterMinorUnits(5015_00L)
                .journalPostingIds(List.of(1L, 2L))
                .settledAt(Instant.now())
                .build();

        PaymentTransactionReadModel model = service.ingestSettledEvent(event);

        assertThat(model).isNotNull();
        assertThat(model.getTransactionId()).isEqualTo("tx_1001");
        assertThat(model.getStatus()).isEqualTo("SETTLED");

        // Verify O(1) transaction lookup
        Optional<PaymentTransactionReadModel> retrievedTx = service.getTransaction("tx_1001");
        assertThat(retrievedTx).isPresent();
        assertThat(retrievedTx.get().getAmountMinorUnits()).isEqualTo(1500L);

        // Verify account summary materialized update
        Optional<AccountSummaryReadModel> alice = service.getAccountSummary("acc_alice");
        assertThat(alice).isPresent();
        assertThat(alice.get().getCurrentBalanceMinorUnits()).isEqualTo(9985_00L);
        assertThat(alice.get().getTotalOutflowMinorUnits()).isEqualTo(1500L);

        Optional<AccountSummaryReadModel> bob = service.getAccountSummary("acc_bob");
        assertThat(bob).isPresent();
        assertThat(bob.get().getCurrentBalanceMinorUnits()).isEqualTo(5015_00L);
        assertThat(bob.get().getTotalInflowMinorUnits()).isEqualTo(1500L);

        // Verify metrics
        SystemMetricSnapshot metrics = service.getMetricsSnapshot();
        assertThat(metrics.getTotalTransactionsProcessed()).isEqualTo(1L);
    }
}
