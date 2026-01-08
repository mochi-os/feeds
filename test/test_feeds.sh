#!/bin/bash
# Feeds app test suite
# Usage: ./test_feeds.sh

set -e

SCRIPT_DIR="$(dirname "$0")"
CURL_HELPER="/home/alistair/mochi/test/claude/curl.sh"

PASSED=0
FAILED=0
FEED_ENTITY=""
POST_ID=""
COMMENT_ID=""

pass() {
    echo "[PASS] $1"
    ((PASSED++)) || true
}

fail() {
    echo "[FAIL] $1: $2"
    ((FAILED++))
}

# Helper to make feed requests
# Entity context uses /-/ prefix for feed-level routes
feed_curl() {
    local method="$1"
    local path="$2"
    shift 2
    "$CURL_HELPER" -a admin -X "$method" "$@" "$BASE_URL$path"
}

# Helper for feed-level routes that need /-/ prefix in entity context
feed_api_curl() {
    local method="$1"
    local path="$2"
    shift 2
    "$CURL_HELPER" -a admin -X "$method" "$@" "$BASE_URL/-$path"
}

echo "=============================================="
echo "Feeds Test Suite"
echo "=============================================="

# ============================================================================
# FEED CREATION TEST
# ============================================================================

echo ""
echo "--- Feed Creation Test ---"

# Test: Create feed
RESULT=$("$CURL_HELPER" -a admin -X POST -H "Content-Type: application/json" -d '{"name":"Test Feed","privacy":"public"}' "/feeds/create")
if echo "$RESULT" | grep -q '"id":"'; then
    FEED_ENTITY=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
    if [ -n "$FEED_ENTITY" ]; then
        pass "Create feed (entity: $FEED_ENTITY)"
        BASE_URL="/feeds/$FEED_ENTITY"
    else
        fail "Create feed" "Could not extract entity ID"
        exit 1
    fi
else
    fail "Create feed" "$RESULT"
    exit 1
fi

echo "Using feed entity: $FEED_ENTITY"

# ============================================================================
# FEED INFO TESTS
# ============================================================================

echo ""
echo "--- Feed Info Tests ---"

# Test: Get feed info
RESULT=$(feed_api_curl GET "/info")
if echo "$RESULT" | grep -q '"name":"Test Feed"'; then
    pass "Get feed info"
else
    fail "Get feed info" "$RESULT"
fi

# Test: Class-level info
RESULT=$("$CURL_HELPER" -a admin -X GET "/feeds/info")
if echo "$RESULT" | grep -q '"feeds":\['; then
    pass "Get class info"
else
    fail "Get class info" "$RESULT"
fi

# ============================================================================
# POST LIFECYCLE TESTS
# ============================================================================

echo ""
echo "--- Post Lifecycle Tests ---"

# Test: Create post (uses multipart form data for attachment support)
RESULT=$(feed_api_curl POST "/post/create" -F "body=Test post content")
if echo "$RESULT" | grep -q '"id":"'; then
    POST_ID=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
    if [ -n "$POST_ID" ]; then
        pass "Create post (id: $POST_ID)"
    else
        fail "Create post" "Could not extract post ID"
    fi
else
    fail "Create post" "$RESULT"
fi

# Test: Get posts
RESULT=$(feed_api_curl GET "/posts")
if echo "$RESULT" | grep -q '"posts":\['; then
    pass "Get posts"
else
    fail "Get posts" "$RESULT"
fi

# Test: Get single post
RESULT=$(feed_api_curl GET "/$POST_ID")
if echo "$RESULT" | grep -q '"posts":\['; then
    pass "Get single post"
else
    fail "Get single post" "$RESULT"
fi

# Test: Edit post (uses multipart form data for attachment support)
RESULT=$(feed_api_curl POST "/$POST_ID/edit" -F "body=Updated post content")
if echo "$RESULT" | grep -q '"ok":true'; then
    pass "Edit post"
else
    fail "Edit post" "$RESULT"
fi

# ============================================================================
# REACTION TESTS
# ============================================================================

echo ""
echo "--- Reaction Tests ---"

# Test: Add reaction to post
RESULT=$(feed_api_curl POST "/$POST_ID/react" -H "Content-Type: application/json" -d '{"reaction":"like"}')
if echo "$RESULT" | grep -q '"reaction":"like"'; then
    pass "Add post reaction"
else
    fail "Add post reaction" "$RESULT"
fi

# Test: Change reaction
RESULT=$(feed_api_curl POST "/$POST_ID/react" -H "Content-Type: application/json" -d '{"reaction":"love"}')
if echo "$RESULT" | grep -q '"reaction":"love"'; then
    pass "Change post reaction"
else
    fail "Change post reaction" "$RESULT"
fi

# Test: Remove reaction (use "none" to remove)
RESULT=$(feed_api_curl POST "/$POST_ID/react" -H "Content-Type: application/json" -d '{"reaction":"none"}')
if echo "$RESULT" | grep -q '"reaction":""'; then
    pass "Remove post reaction"
else
    fail "Remove post reaction" "$RESULT"
fi

# ============================================================================
# COMMENT TESTS
# ============================================================================

echo ""
echo "--- Comment Tests ---"

# Test: Create comment
RESULT=$(feed_api_curl POST "/$POST_ID/comment/create" -H "Content-Type: application/json" -d '{"body":"Test comment"}')
if echo "$RESULT" | grep -q '"id":"'; then
    COMMENT_ID=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
    if [ -n "$COMMENT_ID" ]; then
        pass "Create comment (id: $COMMENT_ID)"
    else
        fail "Create comment" "Could not extract comment ID"
    fi
else
    fail "Create comment" "$RESULT"
fi

# Test: Create nested comment (reply)
RESULT=$(feed_api_curl POST "/$POST_ID/comment/create" -H "Content-Type: application/json" -d "{\"body\":\"Test reply\",\"parent\":\"$COMMENT_ID\"}")
if echo "$RESULT" | grep -q '"id":"'; then
    pass "Create nested comment"
else
    fail "Create nested comment" "$RESULT"
fi

# Test: React to comment
RESULT=$(feed_api_curl POST "/$POST_ID/comment/react" -H "Content-Type: application/json" -d "{\"comment\":\"$COMMENT_ID\",\"reaction\":\"like\"}")
if echo "$RESULT" | grep -q '"reaction":"like"'; then
    pass "React to comment"
else
    fail "React to comment" "$RESULT"
fi

# Test: Edit comment
RESULT=$(feed_api_curl POST "/$POST_ID/$COMMENT_ID/edit" -H "Content-Type: application/json" -d '{"body":"Updated comment"}')
if echo "$RESULT" | grep -q '"ok":true'; then
    pass "Edit comment"
else
    fail "Edit comment" "$RESULT"
fi

# ============================================================================
# SEARCH TESTS
# ============================================================================

echo ""
echo "--- Search Tests ---"

# Test: Search feeds
RESULT=$("$CURL_HELPER" -a admin -X GET "/feeds/-/directory/search?search=Test")
if echo "$RESULT" | grep -q '"data":\['; then
    pass "Search feeds"
else
    fail "Search feeds" "$RESULT"
fi

# Test: Empty search
RESULT=$("$CURL_HELPER" -a admin -X GET "/feeds/-/directory/search?search=nonexistent-xyz-123")
if echo "$RESULT" | grep -q '"data":\[\]'; then
    pass "Empty search results"
else
    fail "Empty search results" "$RESULT"
fi

# ============================================================================
# ACCESS CONTROL TESTS
# ============================================================================

echo ""
echo "--- Access Control Tests ---"

# Test: List access rules
RESULT=$(feed_api_curl GET "/access")
if echo "$RESULT" | grep -q '"rules":\['; then
    pass "List access rules"
else
    fail "List access rules" "$RESULT"
fi

# Test: List members
RESULT=$(feed_api_curl GET "/members")
if echo "$RESULT" | grep -q '"data":{'; then
    pass "List members"
else
    fail "List members" "$RESULT"
fi

# ============================================================================
# CLEANUP TESTS
# ============================================================================

echo ""
echo "--- Cleanup Tests ---"

# Test: Delete comment
RESULT=$(feed_api_curl POST "/$POST_ID/$COMMENT_ID/delete")
if echo "$RESULT" | grep -q '"ok":true'; then
    pass "Delete comment"
else
    fail "Delete comment" "$RESULT"
fi

# Test: Delete post
RESULT=$(feed_api_curl POST "/$POST_ID/delete")
if echo "$RESULT" | grep -q '"ok":true'; then
    pass "Delete post"
else
    fail "Delete post" "$RESULT"
fi

# Test: Delete feed
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
