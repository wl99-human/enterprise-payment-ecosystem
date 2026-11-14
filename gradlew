#!/usr/bin/env bash
# Gradle wrapper proxy forwarding to backend
DIRNAME="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$DIRNAME/backend/gradlew" "$@"
