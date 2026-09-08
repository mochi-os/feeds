#!/bin/bash
# Copyright © 2026 Mochisoft OÜ
# SPDX-License-Identifier: AGPL-3.0-only
# This file is part of Mochi, licensed under the GNU AGPL v3 with the
# Mochi Application Interface Exception - see license.txt and license-exception.md.

# Feeds Source Credibility Test Suite
# Tests credibility CRUD on feed sources via HTTP API
# Usage: ./test_credibility.sh

# No `set -e`. Every value below is extracted with python3, and under `set -e` a
# response that does not parse kills the script at the assignment - before the
# check that would have recorded it, so a broken run read as a clean one.

CURL_HELPER="/home/alistair/mochi/claude/scripts/curl.sh"

PASSED=0
FAILED=0
FEED_ENTITY=""
SOURCE_ID=""

pass() {
    echo "[PASS] $1"
    PASSED=$((PASSED + 1))
}

fail() {
    echo "[FAIL] $1: $2"
    FAILED=$((FAILED + 1))
}

# Read one dotted JSON path from a response, empty if absent or unparseable.
# Never fails the shell: the caller decides what a missing value means.
field() {
    python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for key in sys.argv[1].split('.'):
    if not isinstance(d, dict):
        sys.exit(0)
    d = d.get(key)
    if d == None:
        sys.exit(0)
print(d)
" "$1" 2>/dev/null
}

# The credibility of one source in a -/sources listing, empty if the source is
# not in the list at all.
source_credibility() {
    python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for s in d.get('data', {}).get('sources', []):
    if s.get('id') == sys.argv[1]:
        print(s.get('credibility', ''))
        break
" "$1" 2>/dev/null
}

# Helper to make feed-level requests (entity context with /-/ prefix)
feed_curl() {
    local method="$1"
    local path="$2"
    shift 2
    "$CURL_HELPER" -a admin -X "$method" "$@" "/feeds/$FEED_ENTITY/-$path"
}

echo "=============================================="
echo "Feeds Source Credibility Test Suite"
echo "=============================================="

# ============================================================================
# SETUP: Create test feed
# ============================================================================

echo ""
echo "--- Setup ---"

RESULT=$("$CURL_HELPER" -a admin -X POST -H "Content-Type: application/json" -d '{"name":"Credibility Test Feed","privacy":"private"}' "/feeds/-/create")
FEED_ENTITY=$(echo "$RESULT" | field data.id)

if [ -n "$FEED_ENTITY" ]; then
    echo "Created test feed: $FEED_ENTITY"
else
    echo "FATAL: Could not create test feed"
    echo "Response: $RESULT"
    exit 1
fi

# ============================================================================
# SOURCE CREDIBILITY TESTS
# ============================================================================

echo ""
echo "--- List Sources ---"

# Credibility is a property of a source row, whatever kind of source it is, so
# the subject is the memories source -/create already made. An RSS source would
# need an outbound fetch, and so a url: grant for whatever host the fixture
# names - the same reason test_sources_transform.sh works off memories.
RESULT=$(feed_curl GET "/sources")
SOURCE_ID=$(echo "$RESULT" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for s in d.get('data', {}).get('sources', []):
    print(s.get('id', ''))
    break
" 2>/dev/null)

if [ -n "$SOURCE_ID" ]; then
    pass "New feed has a source (id: $SOURCE_ID)"
else
    fail "New feed has a source" "$RESULT"
fi

CRED=$(echo "$RESULT" | source_credibility "$SOURCE_ID")

if [ -n "$CRED" ]; then
    pass "List sources has credibility field (value: $CRED)"
else
    fail "List sources credibility" "credibility field missing or not found: $RESULT"
fi

echo ""
echo "--- Edit Credibility ---"

# Test: Edit credibility to 42
RESULT=$(feed_curl POST "/sources/edit" -H "Content-Type: application/json" -d "{\"source\":\"$SOURCE_ID\",\"credibility\":42}")
if [ "$(echo "$RESULT" | field data.ok)" == "True" ]; then
    pass "Edit credibility to 42"
else
    fail "Edit credibility to 42" "$RESULT"
fi

# Test: Verify credibility is now 42
RESULT=$(feed_curl GET "/sources")
CRED=$(echo "$RESULT" | source_credibility "$SOURCE_ID")

if [ "$CRED" = "42" ]; then
    pass "Verify credibility is 42"
else
    fail "Verify credibility is 42" "got: $CRED"
fi

echo ""
echo "--- Edit Name ---"

# Test: Edit source name
RESULT=$(feed_curl POST "/sources/edit" -H "Content-Type: application/json" -d "{\"source\":\"$SOURCE_ID\",\"name\":\"Renamed Source\"}")
if [ "$(echo "$RESULT" | field data.ok)" == "True" ]; then
    pass "Edit source name"
else
    fail "Edit source name" "$RESULT"
fi

echo ""
echo "--- Boundary Validation ---"

# The handler answers a labelled error for an out-of-range credibility, so the
# assertion is "an error, and no ok" - matching the word "credibility" anywhere
# in the body would also pass on a success response that echoed the field.
refused() {
    local result="$1"
    [ -n "$(echo "$result" | field error)" ] && [ -z "$(echo "$result" | field data.ok)" ]
}

# Test: Credibility too high (101)
RESULT=$(feed_curl POST "/sources/edit" -H "Content-Type: application/json" -d "{\"source\":\"$SOURCE_ID\",\"credibility\":101}")
if refused "$RESULT"; then
    pass "Reject credibility=101"
else
    fail "Reject credibility=101" "Expected error, got: $RESULT"
fi

# Test: Credibility too low (-1)
RESULT=$(feed_curl POST "/sources/edit" -H "Content-Type: application/json" -d "{\"source\":\"$SOURCE_ID\",\"credibility\":-1}")
if refused "$RESULT"; then
    pass "Reject credibility=-1"
else
    fail "Reject credibility=-1" "Expected error, got: $RESULT"
fi

# Verify credibility didn't change from 42 after invalid edits
RESULT=$(feed_curl GET "/sources")
CRED=$(echo "$RESULT" | source_credibility "$SOURCE_ID")

if [ "$CRED" = "42" ]; then
    pass "Credibility unchanged after invalid edits"
else
    fail "Credibility unchanged after invalid edits" "got: $CRED, expected: 42"
fi

echo ""
echo "--- Edit Nonexistent Source ---"

# Test: Edit with bogus source ID
RESULT=$(feed_curl POST "/sources/edit" -H "Content-Type: application/json" -d '{"source":"nonexistent-id-999","credibility":50}')
if refused "$RESULT"; then
    pass "Reject edit of nonexistent source"
else
    fail "Reject edit of nonexistent source" "Expected error, got: $RESULT"
fi

# ============================================================================
# CLEANUP
# ============================================================================

echo ""
echo "--- Cleanup ---"

RESULT=$(feed_curl POST "/delete")
if [ "$(echo "$RESULT" | field data.success)" == "True" ]; then
    echo "Deleted test feed"
else
    echo "WARNING: Could not delete test feed: $RESULT"
fi

# ============================================================================
# SUMMARY
# ============================================================================

echo ""
echo "=============================================="
echo "Results: $PASSED passed, $FAILED failed"
echo "=============================================="

if [ $FAILED -gt 0 ]; then
    exit 1
fi
