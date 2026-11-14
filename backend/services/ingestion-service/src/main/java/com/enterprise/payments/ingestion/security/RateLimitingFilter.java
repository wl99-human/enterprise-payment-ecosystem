package com.enterprise.payments.ingestion.security;

import com.enterprise.payments.dsa.SlidingWindowRateLimiter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RateLimitingFilter extends OncePerRequestFilter {

    private final SlidingWindowRateLimiter rateLimiter;

    public RateLimitingFilter(
            @Value("${ecosystem.rate-limit.window-millis:10000}") long windowMillis,
            @Value("${ecosystem.rate-limit.max-requests:100}") int maxRequests) {
        this.rateLimiter = new SlidingWindowRateLimiter(windowMillis, maxRequests);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String path = request.getRequestURI();
        if (path.startsWith("/api/v1/payments/transfer")) {
            String clientIp = resolveClientIp(request);
            boolean allowed = rateLimiter.allowRequest(clientIp);

            if (!allowed) {
                response.setStatus(429);
                response.setContentType("application/json");
                response.setHeader("Retry-After", String.valueOf(rateLimiter.getWindowMillis() / 1000));
                response.getWriter().write("""
                        {
                            "status": "RATE_LIMITED",
                            "error": "HTTP 429 Too Many Requests: Sliding Window Counter Rate Limit Exceeded",
                            "windowMillis": %d,
                            "limit": %d
                        }
                        """.formatted(rateLimiter.getWindowMillis(), rateLimiter.getMaxLimit()));
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private String resolveClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isBlank()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr() != null ? request.getRemoteAddr() : "unknown-client";
    }

    public SlidingWindowRateLimiter getRateLimiter() {
        return rateLimiter;
    }
}
