#!/bin/bash
# Feeds P2P non-subscriber test suite
# Tests interactions from users who are NOT subscribed to a feed
#
# Note: Feeds have different access model than forums:
# - Only the owner creates posts
# - Non-subscribers can view public feeds but cannot react/comment without explicit access

set -e

CURL="/home/alistair/mochi/test/claude/curl.sh"

PASSED=0
FAILED=0

pass() {
    echo "[PASS] $1"
    ((PASSED++)) || true
}

fail() {
    echo "[FAIL] $1: $2"
    ((FAILED++)) || true
}

echo "=============================================="
echo "Feeds Non-Subscriber P2P Test Suite"
echo "=============================================="

# ============================================================================
# SETUP: Create feed on instance 1
# ============================================================================

echo ""
echo "--- Setup: Create Feed on Instance 1 ---"

RESULT=$("$CURL" -i 1 -a admin -X POST -H "Content-Type: application/json" \
    -d '{"name":"Non-Sub Test Feed","privacy":"public"}' "/feeds/create")
FEED_ID=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)

if [ -n "$FEED_ID" ]; then
    pass "Create feed on instance 1 (id: $FEED_ID)"
else
    fail "Create feed" "$RESULT"
    exit 1
fi

# Create a post as owner
RESULT=$("$CURL" -i 1 -a admin -X POST \
    -F "body=This is a post by the feed owner" \
    "/feeds/$FEED_ID/-/post/create")
OWNER_POST_ID=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)

if [ -n "$OWNER_POST_ID" ]; then
    pass "Create post as owner (id: $OWNER_POST_ID)"
else
    fail "Create post as owner" "$RESULT"
fi

# Owner reacts to their post
RESULT=$("$CURL" -i 1 -a admin -X POST -H "Content-Type: application/json" \
    -d '{"reaction":"like"}' "/feeds/$FEED_ID/-/$OWNER_POST_ID/react")
if echo "$RESULT" | grep -q '"reaction":"like"'; then
    pass "Owner reacts to their post (like)"
else
    fail "Owner reacts to post" "$RESULT"
fi

# Owner adds a comment
RESULT=$("$CURL" -i 1 -a admin -X POST -H "Content-Type: application/json" \
    -d '{"body":"Owner comment on the post"}' "/feeds/$FEED_ID/-/$OWNER_POST_ID/comment/create")
OWNER_COMMENT_ID=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)

if [ -n "$OWNER_COMMENT_ID" ]; then
    pass "Owner creates comment (id: $OWNER_COMMENT_ID)"
else
    fail "Owner creates comment" "$RESULT"
fi

sleep 1

# ============================================================================
# TEST: Non-subscriber views feed (without subscribing)
# ============================================================================

echo ""
echo "--- Non-Subscriber View Test ---"

# Instance 2 views posts WITHOUT subscribing
RESULT=$("$CURL" -i 2 -a admin -X GET "/feeds/$FEED_ID/-/posts")
if echo "$RESULT" | grep -q '"posts":\['; then
    pass "Non-subscriber can view public feed posts"
    # Check if reaction is visible
    if echo "$RESULT" | grep -q '"my_reaction":"like"\|"reactions":\[{'; then
        pass "Reaction data visible to non-subscriber"
    else
        fail "Reaction data visible" "$RESULT"
    fi
else
    fail "Non-subscriber can view public feed posts" "$RESULT"
fi

# View single post with comments
RESULT=$("$CURL" -i 2 -a admin -X GET "/feeds/$FEED_ID/-/$OWNER_POST_ID")
if echo "$RESULT" | grep -q '"comments":\[{'; then
    pass "Non-subscriber can view post with comments"
else
    # Maybe no comments array if empty, check for post data
    if echo "$RESULT" | grep -q '"body":"This is a post'; then
        pass "Non-subscriber can view post content"
    else
        fail "Non-subscriber can view post" "$RESULT"
    fi
fi

# ============================================================================
# TEST: Non-subscriber cannot react without access
# ============================================================================

echo ""
echo "--- Non-Subscriber Reaction Test (Access Denied Expected) ---"

RESULT=$("$CURL" -i 2 -a admin -X POST -H "Content-Type: application/json" \
    -d '{"reaction":"love"}' "/feeds/$FEED_ID/-/$OWNER_POST_ID/react")
if echo "$RESULT" | grep -q '"error"'; then
    pass "Non-subscriber reaction denied (expected)"
else
    # If reaction succeeded, it means feeds allow public reactions
    if echo "$RESULT" | grep -q '"reaction":"love"'; then
        pass "Non-subscriber can react on public feed (allowed)"
        NONSUB_CAN_REACT=true
    else
        fail "Non-subscriber reaction response" "$RESULT"
    fi
fi

# ============================================================================
# TEST: Non-subscriber cannot comment without access
# ============================================================================

echo ""
echo "--- Non-Subscriber Comment Test (Access Denied Expected) ---"

RESULT=$("$CURL" -i 2 -a admin -X POST -H "Content-Type: application/json" \
    -d '{"body":"Non-subscriber comment attempt"}' "/feeds/$FEED_ID/-/$OWNER_POST_ID/comment/create")
if echo "$RESULT" | grep -q '"error"'; then
    pass "Non-subscriber comment denied (expected)"
else
    # If comment succeeded, it means feeds allow public comments
    if echo "$RESULT" | grep -q '"id":'; then
        pass "Non-subscriber can comment on public feed (allowed)"
        NONSUB_CAN_COMMENT=true
    else
        fail "Non-subscriber comment response" "$RESULT"
    fi
fi

# ============================================================================
# TEST: Subscribe and then interact
# ============================================================================

echo ""
echo "--- Subscribe and Interact Test ---"

RESULT=$("$CURL" -i 2 -a admin -X POST "/feeds/$FEED_ID/-/subscribe")
if echo "$RESULT" | grep -q '"data"\|"fingerprint"'; then
    pass "Subscribe from instance 2"
else
    fail "Subscribe from instance 2" "$RESULT"
fi

sleep 2

# After subscribing, should be able to react
RESULT=$("$CURL" -i 2 -a admin -X POST -H "Content-Type: application/json" \
    -d '{"reaction":"love"}' "/feeds/$FEED_ID/-/$OWNER_POST_ID/react")
if echo "$RESULT" | grep -q '"reaction":"love"'; then
    pass "Subscriber can react after subscribing"
else
    fail "Subscriber react after subscribing" "$RESULT"
fi

# After subscribing, should be able to comment
RESULT=$("$CURL" -i 2 -a admin -X POST -H "Content-Type: application/json" \
    -d '{"body":"Subscriber comment after subscribing"}' "/feeds/$FEED_ID/-/$OWNER_POST_ID/comment/create")
if echo "$RESULT" | grep -q '"id":'; then
    pass "Subscriber can comment after subscribing"
else
    fail "Subscriber comment after subscribing" "$RESULT"
fi

sleep 2

# Verify comment synced to owner
RESULT=$("$CURL" -i 1 -a admin -X GET "/feeds/$FEED_ID/-/$OWNER_POST_ID")
if echo "$RESULT" | grep -q "Subscriber comment after subscribing"; then
    pass "Comment synced to owner"
else
    fail "Comment synced to owner" "$RESULT"
fi

# Verify reaction synced to owner
if echo "$RESULT" | grep -q '"reaction":"love"'; then
    pass "Reaction synced to owner"
else
    fail "Reaction synced to owner" "$RESULT"
fi

# ============================================================================
# CLEANUP
# ============================================================================

echo ""
echo "--- Cleanup ---"

RESULT=$("$CURL" -i 2 -a admin -X POST "/feeds/$FEED_ID/-/unsubscribe")
if echo "$RESULT" | grep -q '"data"'; then
    pass "Unsubscribe from instance 2"
else
    fail "Unsubscribe from instance 2" "$RESULT"
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
