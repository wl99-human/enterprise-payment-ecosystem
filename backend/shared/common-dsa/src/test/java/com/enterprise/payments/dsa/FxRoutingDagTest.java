package com.enterprise.payments.dsa;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FxRoutingDagTest {

    @Test
    @DisplayName("Finds lowest-fee multi-hop FX route via Dijkstra")
    void shouldFindOptimalMultiHopRoute() {
        FxRoutingDag dag = new FxRoutingDag();

        // Direct USD -> JPY with high fee: 3.5%
        dag.addLiquidityPair("USD", "JPY", 0.035, 155.0);

        // Multi-hop USD -> EUR (0.5%) -> JPY (0.8%): Total fee = 1.3%
        dag.addLiquidityPair("USD", "EUR", 0.005, 0.92);
        dag.addLiquidityPair("EUR", "JPY", 0.008, 168.0);

        // Alternative route USD -> GBP (1.0%) -> JPY (1.5%): Total fee = 2.5%
        dag.addLiquidityPair("USD", "GBP", 0.010, 0.79);
        dag.addLiquidityPair("GBP", "JPY", 0.015, 196.0);

        Optional<FxRoutingDag.RoutingPath> optimal = dag.findOptimalPath("USD", "JPY");
        assertThat(optimal).isPresent();
        FxRoutingDag.RoutingPath route = optimal.get();

        // Should choose USD -> EUR -> JPY (total fee 1.3%)
        assertThat(route.path()).containsExactly("USD", "EUR", "JPY");
        assertThat(route.totalFeePercentage()).isCloseTo(0.013, org.assertj.core.data.Offset.offset(0.0001));
        assertThat(route.effectiveRate()).isCloseTo(0.92 * 168.0, org.assertj.core.data.Offset.offset(0.01));
    }

    @Test
    @DisplayName("Detects cycles in fee deduction schedules via Topological Sort")
    void shouldDetectCyclesInFeeSchedules() {
        // Valid Acyclic DAG: FeeA -> FeeB -> FeeC
        Map<String, List<String>> validDag = Map.of(
                "FeeA", List.of("FeeB"),
                "FeeB", List.of("FeeC"),
                "FeeC", List.of()
        );

        List<String> sorted = FxRoutingDag.topologicalSort(validDag);
        assertThat(sorted).containsExactly("FeeA", "FeeB", "FeeC");

        // Cyclic Graph: FeeA -> FeeB -> FeeC -> FeeA
        Map<String, List<String>> cyclicGraph = Map.of(
                "FeeA", List.of("FeeB"),
                "FeeB", List.of("FeeC"),
                "FeeC", List.of("FeeA")
        );

        assertThatThrownBy(() -> FxRoutingDag.topologicalSort(cyclicGraph))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Cycle detected");
    }
}
