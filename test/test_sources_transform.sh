#!/bin/bash
# Test suite for feed source transform feature
# Tests: schema migration, source CRUD with transform field, transform persistence
# Usage: ./test_sources_transform.sh

set -e

CURL_HELPER="/home/alistair/mochi/claude/scripts/curl.sh"

PASSED=0
FAILED=0
FEED_ENTITY=""
SOURCE_ID=""

pass() {
    echo "[PASS] $1"
    ((PASSED++)) || true
}

fail() {
    echo "[FAIL] $1: $2"
    ((FAILED++))
}

feed_api_curl() {
    local method="$1"
    local path="$2"
    shift 2
    "$CURL_HELPER" -a admin -X "$method" "$@" "$BASE_URL/-$path"
}

echo "=============================================="
echo "Source Transform Test Suite"
echo "=============================================="

# ============================================================================
# SETUP: Create a feed with a memories source (no network needed)
# ============================================================================

echo ""
echo "--- Setup ---"

RESULT=$("$CURL_HELPER" -a admin -X POST -H "Content-Type: application/json" -d '{"name":"Transform Test Feed","privacy":"public"}' "/feeds/-/create")
if echo "$RESULT" | grep -q '"id":"'; then
    FEED_ENTITY=$(echo "$RESULT" | python3 -c "import sys, json; d=json.load(sys.stdin)['data']; print(d['fingerprint'])" 2>/dev/null)
    if [ -n "$FEED_ENTITY" ]; then
        pass "Create feed (fingerprint: $FEED_ENTITY)"
        BASE_URL="/feeds/$FEED_ENTITY"
    else
        fail "Create feed" "Could not extract fingerprint"
        exit 1
    fi
else
    fail "Create feed" "$RESULT"
    exit 1
fi

# Get the auto-created memories source
RESULT=$(feed_api_curl GET "/sources")
SOURCE_ID=$(echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
sources = data['data']['sources']
# Use first source (memories is auto-created)
print(sources[0]['id'])
" 2>/dev/null)
if [ -n "$SOURCE_ID" ]; then
    pass "Got existing source (id: $SOURCE_ID)"
else
    fail "Get existing source" "$RESULT"
    exit 1
fi

# ============================================================================
# VERIFY TRANSFORM COLUMN EXISTS (default empty)
# ============================================================================

echo ""
echo "--- Transform Column Tests ---"

RESULT=$(feed_api_curl GET "/sources")
if echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
sources = data['data']['sources']
source = [s for s in sources if s['id'] == '$SOURCE_ID'][0]
assert 'transform' in source, 'transform field missing'
assert source['transform'] == '', f'expected empty, got: {source[\"transform\"]}'
" 2>/dev/null; then
    pass "Source has transform field (default empty)"
else
    fail "Source has transform field" "$RESULT"
fi

# ============================================================================
# SET TRANSFORM PROMPT
# ============================================================================

echo ""
echo "--- Set Transform ---"

RESULT=$(feed_api_curl POST "/sources/edit" -H "Content-Type: application/json" -d "{\"source\":\"$SOURCE_ID\",\"transform\":\"Summarize the description in 2 bullet points\"}")
if echo "$RESULT" | grep -q '"ok":true'; then
    pass "Set transform prompt"
else
    fail "Set transform prompt" "$RESULT"
fi

# Verify transform was saved
RESULT=$(feed_api_curl GET "/sources")
TRANSFORM_VAL=$(echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
sources = data['data']['sources']
source = [s for s in sources if s['id'] == '$SOURCE_ID'][0]
print(source['transform'])
" 2>/dev/null)
if [ "$TRANSFORM_VAL" = "Summarize the description in 2 bullet points" ]; then
    pass "Transform prompt persisted"
else
    fail "Transform prompt persisted" "got: $TRANSFORM_VAL"
fi

# ============================================================================
# UPDATE TRANSFORM PROMPT
# ============================================================================

echo ""
echo "--- Update Transform ---"

RESULT=$(feed_api_curl POST "/sources/edit" -H "Content-Type: application/json" -d "{\"source\":\"$SOURCE_ID\",\"transform\":\"Translate to French\"}")
if echo "$RESULT" | grep -q '"ok":true'; then
    pass "Update transform prompt"
else
    fail "Update transform prompt" "$RESULT"
fi

RESULT=$(feed_api_curl GET "/sources")
TRANSFORM_VAL=$(echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
sources = data['data']['sources']
source = [s for s in sources if s['id'] == '$SOURCE_ID'][0]
print(source['transform'])
" 2>/dev/null)
if [ "$TRANSFORM_VAL" = "Translate to French" ]; then
    pass "Updated transform persisted"
else
    fail "Updated transform persisted" "got: $TRANSFORM_VAL"
fi

# ============================================================================
# CLEAR TRANSFORM PROMPT
# ============================================================================

echo ""
echo "--- Clear Transform ---"

RESULT=$(feed_api_curl POST "/sources/edit" -H "Content-Type: application/json" -d "{\"source\":\"$SOURCE_ID\",\"transform\":\"\"}")
if echo "$RESULT" | grep -q '"ok":true'; then
    pass "Clear transform prompt"
else
    fail "Clear transform prompt" "$RESULT"
fi

RESULT=$(feed_api_curl GET "/sources")
TRANSFORM_VAL=$(echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
sources = data['data']['sources']
source = [s for s in sources if s['id'] == '$SOURCE_ID'][0]
print(source['transform'])
" 2>/dev/null)
if [ -z "$TRANSFORM_VAL" ]; then
    pass "Transform cleared"
else
    fail "Transform cleared" "got: $TRANSFORM_VAL"
fi

# ============================================================================
# EDIT OTHER FIELDS DOESN'T AFFECT TRANSFORM
# ============================================================================

echo ""
echo "--- Independence Tests ---"

# Set transform first
feed_api_curl POST "/sources/edit" -H "Content-Type: application/json" -d "{\"source\":\"$SOURCE_ID\",\"transform\":\"Test prompt\"}" > /dev/null

# Edit name only (should not touch transform)
RESULT=$(feed_api_curl POST "/sources/edit" -H "Content-Type: application/json" -d "{\"source\":\"$SOURCE_ID\",\"name\":\"Renamed Source\"}")
if echo "$RESULT" | grep -q '"ok":true'; then
    pass "Edit name without transform"
else
    fail "Edit name without transform" "$RESULT"
fi

# Verify transform is unchanged and name updated
RESULT=$(feed_api_curl GET "/sources")
VALS=$(echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
sources = data['data']['sources']
source = [s for s in sources if s['id'] == '$SOURCE_ID'][0]
print(source['name'] + '|' + source['transform'])
" 2>/dev/null)
if [ "$VALS" = "Renamed Source|Test prompt" ]; then
    pass "Name changed, transform preserved"
else
    fail "Name changed, transform preserved" "got: $VALS"
fi

# Edit name and transform together
RESULT=$(feed_api_curl POST "/sources/edit" -H "Content-Type: application/json" -d "{\"source\":\"$SOURCE_ID\",\"name\":\"New Name\",\"transform\":\"New prompt\"}")
if echo "$RESULT" | grep -q '"ok":true'; then
    pass "Edit name and transform together"
else
    fail "Edit name and transform together" "$RESULT"
fi

RESULT=$(feed_api_curl GET "/sources")
VALS=$(echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
sources = data['data']['sources']
source = [s for s in sources if s['id'] == '$SOURCE_ID'][0]
print(source['name'] + '|' + source['transform'])
" 2>/dev/null)
if [ "$VALS" = "New Name|New prompt" ]; then
    pass "Both name and transform updated"
else
    fail "Both name and transform updated" "got: $VALS"
fi

# ============================================================================
# TRANSFORM WITH SPECIAL CHARACTERS
# ============================================================================

echo ""
echo "--- Special Characters ---"

# Test with newlines and special chars in transform
RESULT=$(feed_api_curl POST "/sources/edit" -H "Content-Type: application/json" -d "{\"source\":\"$SOURCE_ID\",\"transform\":\"Line 1\\nLine 2\\nDo this: \\\"quote\\\"\"}")
if echo "$RESULT" | grep -q '"ok":true'; then
    pass "Set transform with special characters"
else
    fail "Set transform with special characters" "$RESULT"
fi

RESULT=$(feed_api_curl GET "/sources")
if echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
sources = data['data']['sources']
source = [s for s in sources if s['id'] == '$SOURCE_ID'][0]
t = source['transform']
assert 'Line 1' in t and 'Line 2' in t and 'quote' in t, f'unexpected: {t}'
" 2>/dev/null; then
    pass "Special characters preserved"
else
    fail "Special characters preserved" "$RESULT"
fi

# ============================================================================
# CLEANUP
# ============================================================================

echo ""
echo "--- Cleanup ---"

RESULT=$(feed_api_curl POST "/delete")
if echo "$RESULT" | grep -q '"success":true'; then
    pass "Delete feed"
else
    fail "Delete feed" "$RESULT"
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
