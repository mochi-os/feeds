#!/bin/bash
# Feeds P2P dual-instance test suite
# Tests subscriber interactions between two instances
#
# Note: Feeds have a different model than forums:
# - Only the owner creates posts
# - Subscribers can view, react, and comment

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
echo "Feeds Dual-Instance P2P Test Suite"
echo "=============================================="

# ============================================================================
# SETUP: Create feed on instance 1
# ============================================================================

echo ""
echo "--- Setup: Create Feed on Instance 1 ---"

RESULT=$("$CURL" -i 1 -a admin -X POST -H "Content-Type: application/json" \
    -d '{"name":"P2P Test Feed","privacy":"public"}' "/feeds/create")
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

# Create a second post for more testing
RESULT=$("$CURL" -i 1 -a admin -X POST \
    -F "body=Second post by owner" \
    "/feeds/$FEED_ID/-/post/create")
OWNER_POST_ID2=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)

if [ -n "$OWNER_POST_ID2" ]; then
    pass "Create second post as owner (id: $OWNER_POST_ID2)"
else
    fail "Create second post" "$RESULT"
fi

sleep 1

# ============================================================================
# TEST: Subscribe from instance 2
# ============================================================================

echo ""
echo "--- Subscription Test ---"

RESULT=$("$CURL" -i 2 -a admin -X POST "/feeds/$FEED_ID/-/subscribe")
if echo "$RESULT" | grep -q '"data"\|"fingerprint"'; then
    pass "Subscribe from instance 2"
else
    fail "Subscribe from instance 2" "$RESULT"
fi

sleep 2  # Wait for P2P sync

# Check if posts synced
RESULT=$("$CURL" -i 2 -a admin -X GET "/feeds/$FEED_ID/-/posts")
if echo "$RESULT" | grep -q '"posts":\[{'; then
    pass "Posts synced to subscriber"
    # Count posts
    POST_COUNT=$(echo "$RESULT" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['data']['posts']))" 2>/dev/null)
    echo "    Posts synced: $POST_COUNT"
else
    fail "Posts synced to subscriber" "$RESULT"
fi

# Check if reactions synced (reactions are stored as an array of objects)
RESULT=$("$CURL" -i 2 -a admin -X GET "/feeds/$FEED_ID/-/$OWNER_POST_ID")
if echo "$RESULT" | grep -q '"reaction":"like"'; then
    pass "Reactions synced to subscriber"
else
    fail "Reactions synced to subscriber" "$RESULT"
fi

# Check if comments synced
if echo "$RESULT" | grep -q '"comments":\[{'; then
    pass "Comments synced to subscriber"
else
    fail "Comments synced to subscriber" "$RESULT"
fi

# ============================================================================
# TEST: Subscriber reacts to owner's post
# ============================================================================

echo ""
echo "--- Subscriber Reaction Test ---"

RESULT=$("$CURL" -i 2 -a admin -X POST -H "Content-Type: application/json" \
    -d '{"reaction":"love"}' "/feeds/$FEED_ID/-/$OWNER_POST_ID/react")
if echo "$RESULT" | grep -q '"reaction":"love"'; then
    pass "Subscriber reacts to owner's post (love)"
else
    fail "Subscriber reacts to owner's post" "$RESULT"
fi

sleep 2

# Check reaction synced to owner (reactions are stored as array of objects)
RESULT=$("$CURL" -i 1 -a admin -X GET "/feeds/$FEED_ID/-/$OWNER_POST_ID")
if echo "$RESULT" | grep -q '"reaction":"love"'; then
    pass "Reaction synced to owner (love)"
else
    fail "Reaction synced to owner" "$RESULT"
fi

# Check owner's original reaction still there (stored in my_reaction field)
if echo "$RESULT" | grep -q '"my_reaction":"like"'; then
    pass "Owner's original reaction preserved (like)"
else
    fail "Owner's original reaction preserved" "$RESULT"
fi

# ============================================================================
# TEST: Subscriber changes reaction
# ============================================================================

echo ""
echo "--- Subscriber Change Reaction Test ---"

RESULT=$("$CURL" -i 2 -a admin -X POST -H "Content-Type: application/json" \
    -d '{"reaction":"laugh"}' "/feeds/$FEED_ID/-/$OWNER_POST_ID/react")
if echo "$RESULT" | grep -q '"reaction":"laugh"'; then
    pass "Subscriber changes reaction to laugh"
else
    fail "Subscriber changes reaction" "$RESULT"
fi

sleep 2

# Verify subscriber's reaction changed to laugh
RESULT=$("$CURL" -i 1 -a admin -X GET "/feeds/$FEED_ID/-/$OWNER_POST_ID")
if echo "$RESULT" | grep -q '"reaction":"laugh"'; then
    pass "Changed reaction synced to owner (laugh)"
else
    fail "Changed reaction synced to owner" "$RESULT"
fi

# ============================================================================
# TEST: Subscriber creates comment
# ============================================================================

echo ""
echo "--- Subscriber Comment Test ---"

RESULT=$("$CURL" -i 2 -a admin -X POST -H "Content-Type: application/json" \
    -d '{"body":"Subscriber comment on owner post"}' "/feeds/$FEED_ID/-/$OWNER_POST_ID/comment/create")
SUB_COMMENT_ID=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)

if [ -n "$SUB_COMMENT_ID" ]; then
    pass "Subscriber creates comment (id: $SUB_COMMENT_ID)"
else
    fail "Subscriber creates comment" "$RESULT"
fi

sleep 2

# Check if owner received the comment
RESULT=$("$CURL" -i 1 -a admin -X GET "/feeds/$FEED_ID/-/$OWNER_POST_ID")
if echo "$RESULT" | grep -q "Subscriber comment"; then
    pass "Owner received subscriber's comment"
else
    fail "Owner received subscriber's comment" "$RESULT"
fi

# ============================================================================
# TEST: Subscriber creates nested comment (reply)
# ============================================================================

echo ""
echo "--- Subscriber Nested Comment Test ---"

RESULT=$("$CURL" -i 2 -a admin -X POST -H "Content-Type: application/json" \
    -d "{\"body\":\"Reply to owner comment\",\"parent\":\"$OWNER_COMMENT_ID\"}" "/feeds/$FEED_ID/-/$OWNER_POST_ID/comment/create")
REPLY_COMMENT_ID=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)

if [ -n "$REPLY_COMMENT_ID" ]; then
    pass "Subscriber creates reply comment (id: $REPLY_COMMENT_ID)"
else
    fail "Subscriber creates reply comment" "$RESULT"
fi

sleep 2

# Check if reply synced to owner
RESULT=$("$CURL" -i 1 -a admin -X GET "/feeds/$FEED_ID/-/$OWNER_POST_ID")
if echo "$RESULT" | grep -q "Reply to owner"; then
    pass "Reply synced to owner"
else
    fail "Reply synced to owner" "$RESULT"
fi

# ============================================================================
# TEST: Subscriber reacts to comment
# ============================================================================

echo ""
echo "--- Subscriber Comment Reaction Test ---"

RESULT=$("$CURL" -i 2 -a admin -X POST -H "Content-Type: application/json" \
    -d "{\"comment\":\"$OWNER_COMMENT_ID\",\"reaction\":\"like\"}" "/feeds/$FEED_ID/-/$OWNER_POST_ID/comment/react")
if echo "$RESULT" | grep -q '"reaction":"like"'; then
    pass "Subscriber reacts to owner's comment"
else
    fail "Subscriber reacts to owner's comment" "$RESULT"
fi

sleep 2

# Check comment reaction synced to owner (look for reaction in comment's reactions array)
RESULT=$("$CURL" -i 1 -a admin -X GET "/feeds/$FEED_ID/-/$OWNER_POST_ID")
# The owner comment should have a "like" reaction from the subscriber
if echo "$RESULT" | grep -q "\"comment\":\"$OWNER_COMMENT_ID\".*\"reaction\":\"like\""; then
    pass "Comment reaction synced to owner"
else
    # Try alternate grep - reactions array may be nested differently
    if echo "$RESULT" | grep -q '"reactions":\[{.*"reaction":"like"'; then
        pass "Comment reaction synced to owner"
    else
        fail "Comment reaction synced to owner" "$RESULT"
    fi
fi

# ============================================================================
# TEST: Subscriber edits their comment
# ============================================================================

echo ""
echo "--- Subscriber Edit Comment Test ---"

RESULT=$("$CURL" -i 2 -a admin -X POST -H "Content-Type: application/json" \
    -d '{"body":"Subscriber comment EDITED"}' "/feeds/$FEED_ID/-/$OWNER_POST_ID/$SUB_COMMENT_ID/edit")
if echo "$RESULT" | grep -q '"ok":true'; then
    pass "Subscriber edits their comment"
else
    fail "Subscriber edits their comment" "$RESULT"
fi

sleep 2

# Check if edit synced to owner
RESULT=$("$CURL" -i 1 -a admin -X GET "/feeds/$FEED_ID/-/$OWNER_POST_ID")
if echo "$RESULT" | grep -q "EDITED"; then
    pass "Comment edit synced to owner"
else
    fail "Comment edit synced to owner" "$RESULT"
fi

# ============================================================================
# TEST: Subscriber deletes their comment
# ============================================================================

echo ""
echo "--- Subscriber Delete Comment Test ---"

RESULT=$("$CURL" -i 2 -a admin -X POST "/feeds/$FEED_ID/-/$OWNER_POST_ID/$SUB_COMMENT_ID/delete")
if echo "$RESULT" | grep -q '"ok":true'; then
    pass "Subscriber deletes their comment"
else
    fail "Subscriber deletes their comment" "$RESULT"
fi

sleep 2

# Check if delete synced to owner
RESULT=$("$CURL" -i 1 -a admin -X GET "/feeds/$FEED_ID/-/$OWNER_POST_ID")
if ! echo "$RESULT" | grep -q "Subscriber comment"; then
    pass "Comment delete synced to owner"
else
    fail "Comment delete synced to owner" "$RESULT"
fi

# ============================================================================
# TEST: Subscriber removes their reaction
# ============================================================================

echo ""
echo "--- Subscriber Remove Reaction Test ---"

RESULT=$("$CURL" -i 2 -a admin -X POST -H "Content-Type: application/json" \
    -d '{"reaction":"none"}' "/feeds/$FEED_ID/-/$OWNER_POST_ID/react")
if echo "$RESULT" | grep -q '"reaction":""'; then
    pass "Subscriber removes their reaction"
else
    fail "Subscriber removes their reaction" "$RESULT"
fi

sleep 2

# Check reaction removed on owner side (subscriber's reaction should be gone)
RESULT=$("$CURL" -i 1 -a admin -X GET "/feeds/$FEED_ID/-/$OWNER_POST_ID")
# The subscriber's laugh reaction should no longer exist
if ! echo "$RESULT" | grep -q '"reaction":"laugh"'; then
    pass "Reaction removal synced to owner"
else
    fail "Reaction removal synced to owner" "$RESULT"
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
