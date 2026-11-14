package com.enterprise.payments.dsa;

import java.util.*;

/**
 * 2.3 Directed Acyclic Graph (DAG) for Multi-Hop FX & Fee Routing
 *
 * Models foreign exchange liquidity pairs as a directed weighted graph G = (V, E).
 * Provides:
 * 1. Dijkstra's Algorithm to compute the optimal, lowest-fee / lowest-slippage conversion route.
 * 2. Topological Sorting (Kahn's Algorithm) to validate acyclic fee deduction schedules.
 */
public class FxRoutingDag {

    public record FxEdge(String fromCurrency, String toCurrency, double feeRate, double exchangeRate) {}

    public record RoutingPath(List<String> path, double effectiveRate, double totalFeePercentage) {}

    private final Map<String, List<FxEdge>> adjacencyList = new HashMap<>();
    private final Set<String> currencies = new HashSet<>();

    public synchronized void addLiquidityPair(String from, String to, double feeRate, double exchangeRate) {
        if (feeRate < 0 || exchangeRate <= 0) {
            throw new IllegalArgumentException("Invalid fee or exchange rate");
        }
        currencies.add(from);
        currencies.add(to);
        adjacencyList.computeIfAbsent(from, k -> new ArrayList<>())
                .add(new FxEdge(from, to, feeRate, exchangeRate));
    }

    /**
     * Finds the lowest-fee conversion path from source to target currency
     * using Dijkstra's shortest path algorithm where edge weight is fee percentage.
     */
    public Optional<RoutingPath> findOptimalPath(String source, String target) {
        if (source.equalsIgnoreCase(target)) {
            return Optional.of(new RoutingPath(List.of(source), 1.0, 0.0));
        }

        Map<String, Double> minFees = new HashMap<>();
        Map<String, FxEdge> previousEdges = new HashMap<>();
        PriorityQueue<NodeDistance> pq = new PriorityQueue<>(Comparator.comparingDouble(n -> n.distance));

        for (String c : currencies) {
            minFees.put(c, Double.MAX_VALUE);
        }
        minFees.put(source, 0.0);
        pq.add(new NodeDistance(source, 0.0));

        while (!pq.isEmpty()) {
            NodeDistance current = pq.poll();
            if (current.currency.equalsIgnoreCase(target)) {
                break;
            }
            if (current.distance > minFees.get(current.currency)) {
                continue;
            }

            List<FxEdge> edges = adjacencyList.getOrDefault(current.currency, Collections.emptyList());
            for (FxEdge edge : edges) {
                double newFee = minFees.get(current.currency) + edge.feeRate();
                if (newFee < minFees.get(edge.toCurrency())) {
                    minFees.put(edge.toCurrency(), newFee);
                    previousEdges.put(edge.toCurrency(), edge);
                    pq.add(new NodeDistance(edge.toCurrency(), newFee));
                }
            }
        }

        if (!previousEdges.containsKey(target)) {
            return Optional.empty(); // No valid liquidity route found
        }

        // Reconstruct path
        LinkedList<String> path = new LinkedList<>();
        String curr = target;
        double accumulatedRate = 1.0;
        double totalFee = 0.0;

        path.addFirst(curr);
        while (previousEdges.containsKey(curr)) {
            FxEdge edge = previousEdges.get(curr);
            accumulatedRate *= edge.exchangeRate();
            totalFee += edge.feeRate();
            curr = edge.fromCurrency();
            path.addFirst(curr);
        }

        return Optional.of(new RoutingPath(path, accumulatedRate, totalFee));
    }

    /**
     * Kahn's Algorithm for Topological Sorting & Cycle Detection.
     * Validates that multi-tier fee deduction dependencies are strictly acyclic.
     *
     * @param dependencyGraph Map where Key depends on values.
     * @return List of nodes in topological order, or throws IllegalStateException if cycle detected.
     */
    public static List<String> topologicalSort(Map<String, List<String>> dependencyGraph) {
        Map<String, Integer> inDegree = new HashMap<>();
        Set<String> allNodes = new HashSet<>();

        dependencyGraph.forEach((u, neighbors) -> {
            allNodes.add(u);
            allNodes.addAll(neighbors);
        });

        allNodes.forEach(n -> inDegree.put(n, 0));
        dependencyGraph.values().forEach(neighbors -> {
            for (String v : neighbors) {
                inDegree.put(v, inDegree.get(v) + 1);
            }
        });

        Queue<String> zeroInDegreeQueue = new LinkedList<>();
        inDegree.forEach((node, deg) -> {
            if (deg == 0) {
                zeroInDegreeQueue.add(node);
            }
        });

        List<String> sortedOrder = new ArrayList<>();
        while (!zeroInDegreeQueue.isEmpty()) {
            String u = zeroInDegreeQueue.poll();
            sortedOrder.add(u);

            List<String> neighbors = dependencyGraph.getOrDefault(u, Collections.emptyList());
            for (String v : neighbors) {
                inDegree.put(v, inDegree.get(v) - 1);
                if (inDegree.get(v) == 0) {
                    zeroInDegreeQueue.add(v);
                }
            }
        }

        if (sortedOrder.size() != allNodes.size()) {
            throw new IllegalStateException("Cycle detected in dependency DAG! Invalid fee structure.");
        }

        return sortedOrder;
    }

    private record NodeDistance(String currency, double distance) {}
}
