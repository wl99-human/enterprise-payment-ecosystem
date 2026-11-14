package com.enterprise.payments.ledger;

import com.enterprise.payments.ledger.domain.Account;
import com.enterprise.payments.ledger.repository.AccountRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.math.BigDecimal;
import java.util.List;

@SpringBootApplication
@EnableScheduling
public class LedgerApplication {

    private static final Logger log = LoggerFactory.getLogger(LedgerApplication.class);

    public static void main(String[] args) {
        SpringApplication.run(LedgerApplication.class, args);
    }

    @Bean
    public CommandLineRunner initGenesisAccounts(AccountRepository repository) {
        return args -> {
            if (repository.count() == 0) {
                List<Account> genesisAccounts = List.of(
                        Account.builder().id("acc_alice_01").ownerId("usr_alice").currency("USD").balance(new BigDecimal("10000.0000")).build(),
                        Account.builder().id("acc_bob_02").ownerId("usr_bob").currency("USD").balance(new BigDecimal("5000.0000")).build(),
                        Account.builder().id("acc_charlie_03").ownerId("usr_charlie").currency("USD").balance(new BigDecimal("7500.0000")).build(),
                        Account.builder().id("acc_merchant_prime").ownerId("org_merchant").currency("USD").balance(new BigDecimal("25000.0000")).build(),
                        Account.builder().id("acc_treasury_vault").ownerId("org_treasury").currency("USD").balance(new BigDecimal("1000000.0000")).build()
                );
                repository.saveAll(genesisAccounts);
                log.info("Initialized {} genesis accounts with double-entry balanced capital.", genesisAccounts.size());
            }
        };
    }
}
