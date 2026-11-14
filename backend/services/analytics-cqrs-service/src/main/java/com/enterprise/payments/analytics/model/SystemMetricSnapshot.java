package com.enterprise.payments.analytics.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SystemMetricSnapshot {
    private double currentTps;
    private long totalTransactionsProcessed;
    private double p50LatencyMillis;
    private double p95LatencyMillis;
    private double p99LatencyMillis;
    private long consumerLag;
    private int activeSseSubscribers;
    private Map<Integer, Long> partitionDistribution;
    private Instant recordedAt;
}
