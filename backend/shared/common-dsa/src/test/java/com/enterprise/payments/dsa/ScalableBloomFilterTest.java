package com.enterprise.payments.dsa;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ScalableBloomFilterTest {

    @Test
    @DisplayName("Guarantees Zero False Negatives: All inserted keys must return true")
    void shouldGuaranteeZeroFalseNegatives() {
        int capacity = 5_000;
        ScalableBloomFilter filter = new ScalableBloomFilter(capacity, 0.01);
        Set<String> insertedKeys = new HashSet<>();

        for (int i = 0; i < capacity; i++) {
            String key = "idemp_key_" + UUID.randomUUID();
            insertedKeys.add(key);
            filter.put(key);
        }

        // Zero false negatives: every inserted key must return mightContain == true
        for (String key : insertedKeys) {
            assertThat(filter.mightContain(key))
                    .withFailMessage("Bloom filter reported false negative for key: " + key)
                    .isTrue();
        }
    }

    @Test
    @DisplayName("Maintains false positive rate within specified probability boundary")
    void shouldRespectFalsePositiveTolerance() {
        int capacity = 10_000;
        double targetFpRate = 0.02; // 2%
        ScalableBloomFilter filter = new ScalableBloomFilter(capacity, targetFpRate);

        for (int i = 0; i < capacity; i++) {
            filter.put("existing_key_" + i);
        }

        int testQueries = 10_000;
        int falsePositives = 0;

        for (int i = 0; i < testQueries; i++) {
            String nonExistentKey = "non_existent_key_probe_" + i;
            if (filter.mightContain(nonExistentKey)) {
                falsePositives++;
            }
        }

        double empiricalFpRate = (double) falsePositives / testQueries;
        // Allow slight variance, empirical rate should remain near or under target
        assertThat(empiricalFpRate).isLessThan(targetFpRate + 0.015);
    }
}
