# Plan: Add Star (Favorite) Button to Feed Posts

Branch: `claude/read-feeds-star-m99DF`

## Goal

Add a dedicated "star" (favorite/save) button to each feed post. Starring a post
should boost the user's interest profile for that post's AI tags (similar to the
existing reaction-based interest adjustment, but as a first-class action).
Additionally, remove the per-tag "show more / show less" interest adjustment UI
and its backing endpoint, since starring replaces this as the primary way users
signal interest.

---

## Current State

### Interest adjustment deltas (backend: `feeds.star`)

| Action | Delta | Location |
|---|---|---|
| Manual tag add | +10 | `feeds.star:658` |
| Positive reaction (like, love, thumbsup, star) | +5 | `feeds.star:716` |
| Negative reaction | -10 | `feeds.star:716` |
| Show more (interest up) | +15 | `feeds.star:746` |
| Show less (interest down) | -20 | `feeds.star:748` |
| Manual tag label resolve | +10 | `feeds.star:725` |

### "Show more / show less" code path

- **Backend endpoint**: `action_tag_interest()` at `feeds.star:728-752`, routed via `app.json:60` as `:feed/-/tags/interest`.
- **Frontend API**: `adjustTagInterest()` at `web/src/api/feeds.ts:810-826`, endpoint defined at `web/src/api/endpoints.ts:68`.
- **Frontend handlers** (both `handleInterestUp` and `handleInterestDown`):
  - `web/src/features/feeds/pages/entity-feed-page.tsx:227-249` — passed as `onInterestUp`/`onInterestDown` props at lines 367-368.
  - `web/src/features/feeds/pages/feeds-list-page.tsx:249-272` — passed as props at lines 394-395.
- **FeedPosts component**: Props `onInterestUp`/`onInterestDown` defined at `web/src/features/feeds/components/feed-posts.tsx:82-83`, destructured at 106-107, passed to `<PostTagsTooltip>` at 662-663.
- **PostTagsTooltip**: Imported from `@mochi/common` (external library) — the actual show-more/show-less buttons live there. We cannot modify that component but we can stop passing the props.

### Interest suggestions dialog (KEEP — unrelated to show more/less)

- `web/src/features/feeds/components/interest-suggestions-dialog.tsx` — shown on feed subscribe, calls `adjustTagInterest` with direction `'up'`. This dialog must continue working, so `adjustTagInterest` API function and backend endpoint stay for now (only the per-tag up/down from the tag tooltip is removed).

---

## Changes

### 1. Backend — Add star/unstar post endpoint (`feeds.star`)

**New route in `app.json`** (add after line 67):
```
":feed/-/:post/star": {"function": "action_post_star"}
```

**New function `action_post_star(a)`** (add near `action_post_react`, around line 400):
```python
def action_post_star(a):
    if not a.user:
        a.error(401, "Not logged in")
        return
    user_id = a.user.identity.id
    feed_id = a.input("feed")
    post_id = a.input("post")

    feed_data = feed_by_id(user_id, feed_id)
    if not feed_data:
        a.error(404, "Feed not found")
        return

    post = mochi.db.row("select * from posts where id=? and feed=?", post_id, feed_data["id"])
    if not post:
        a.error(404, "Post not found")
        return

    # Check if already starred
    existing = mochi.db.row(
        "select 1 from stars where post=? and subscriber=?", post_id, user_id
    )
    if existing:
        # Unstar
        mochi.db.execute("delete from stars where post=? and subscriber=?", post_id, user_id)
        starred = False
    else:
        # Star
        mochi.db.execute(
            "insert into stars (post, feed, subscriber, created) values (?, ?, ?, ?)",
            post_id, feed_data["id"], user_id, mochi.time.now()
        )
        starred = True

        # Boost interest for this post's AI tags
        tags = mochi.db.rows(
            "select qid from tags where object=? and source='ai' and qid != ''", post_id
        )
        if tags:
            qids = [t["qid"] for t in tags]
            mochi.interests.adjust(qids, 10)

    return {"data": {"starred": starred}}
```

**New DB table** — add in `database_create()` (after the existing tables, around line 983):
```python
mochi.db.execute("create table if not exists stars (post text not null, feed text not null, subscriber text not null, created integer not null, primary key (post, subscriber))")
mochi.db.execute("create index if not exists stars_subscriber on stars(subscriber, created)")
```

**New DB migration** — add as `to_version == 27`:
```python
if to_version == 27:
    mochi.db.execute("create table if not exists stars (post text not null, feed text not null, subscriber text not null, created integer not null, primary key (post, subscriber))")
    mochi.db.execute("create index if not exists stars_subscriber on stars(subscriber, created)")
```

**Include star state in post responses** — In the function that loads/formats posts for API responses (look for where `my_reaction` is set), also query stars:
- After loading reactions, add: query `stars` table for the current user to get a set of starred post IDs.
- Add `"starred": post_id in starred_set` to each post dict in the response.

Search for `my_reaction` in `feeds.star` to find the exact location where post data is assembled and add the starred field there.

### 2. Backend — Update reaction interest deltas (`feeds.star`)

In `update_interests_from_reaction()` at line 716, change:
```python
# BEFORE
delta = 5 if positive else -10
# AFTER
delta = 3 if positive else -5
```

Rationale: With starring now being the primary interest signal (+10), reactions should have a lighter touch.

In `action_tags_add()` at line 658, change:
```python
# BEFORE
mochi.interests.adjust(qid, 10)
# AFTER
mochi.interests.adjust(qid, 5)
```

In `update_interests_from_manual_tag()` at line 725, change:
```python
# BEFORE
mochi.interests.adjust(top["qid"], 10)
# AFTER
mochi.interests.adjust(top["qid"], 5)
```

### 3. Backend — Remove show-more/show-less from `action_tag_interest` (optional)

**DO NOT remove `action_tag_interest`** — the interest suggestions dialog still calls it with direction `'up'`. Keep the endpoint as-is. We only remove the frontend per-tag up/down calls in the next section.

### 4. Frontend — Add star button and API

**`web/src/api/endpoints.ts`** — add new endpoint (around line 39, inside `post`):
```typescript
star: (feedId: string, postId: string) => `${feedId}/-/${postId}/star`,
```

**`web/src/api/feeds.ts`** — add new API function:
```typescript
const starPost = async (
  feedId: string,
  postId: string
): Promise<{ starred: boolean }> => {
  const response = await client.post<{ data: { starred: boolean } }>(
    endpoints.feeds.post.star(feedId, postId),
    { feed: feedId, post: postId }
  )
  return toDataResponse<{ starred: boolean }>(response, 'star post').data
}
```
Export it from the `feedsApi` object (around line 837+):
```typescript
starPost,
```

**`web/src/types/posts.ts`** — add `starred` field:
- In `Post` interface (line 68): add `starred?: boolean`
- In `FeedPost` interface (line 91): add `starred?: boolean`

### 5. Frontend — Add star button to post cards

**`web/src/features/feeds/components/feed-posts.tsx`**:

Add to props interface:
```typescript
onStarPost?: (feedId: string, postId: string) => void
```

Import `Star` icon from `lucide-react` (already imported icons are at the top of the file).

In the actions row (around line 685, inside the hover-visible `<span>`), add a star button **before** the reaction bar button:
```tsx
<button
  type='button'
  className={`inline-flex items-center gap-1 transition-colors ${
    post.starred
      ? 'text-yellow-500 hover:text-yellow-600'
      : 'text-muted-foreground hover:text-foreground'
  }`}
  onClick={(e) => {
    e.preventDefault()
    e.stopPropagation()
    onStarPost?.(post.feedId, post.id)
  }}
>
  <Star className='size-4' fill={post.starred ? 'currentColor' : 'none'} />
</button>
```

### 6. Frontend — Wire up star handler in pages

**`web/src/features/feeds/pages/entity-feed-page.tsx`**:
```typescript
const handleStarPost = useCallback(
  async (feedId: string, postId: string) => {
    try {
      const result = await feedsApi.starPost(feedId, postId)
      // Update local post state to toggle star
      // (update the post in the posts list/cache — look at how handlePostReaction updates state)
      toast.success(result.starred ? 'Starred' : 'Unstarred')
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to star post'))
    }
  },
  []
)
```
Pass `onStarPost={handleStarPost}` to `<FeedPosts>`.

**`web/src/features/feeds/pages/feeds-list-page.tsx`**: Same pattern.

### 7. Frontend — Remove show-more/show-less prop wiring

**`web/src/features/feeds/components/feed-posts.tsx`**:
- Remove `onInterestUp` and `onInterestDown` from the `FeedPostsProps` interface (lines 82-83).
- Remove them from the destructured props (lines 106-107).
- Remove them from `<PostTagsTooltip>` props (lines 662-663). The external component will gracefully ignore missing optional props.

**`web/src/features/feeds/pages/entity-feed-page.tsx`**:
- Delete `handleInterestUp` and `handleInterestDown` callbacks (lines 227-249).
- Remove `onInterestUp={handleInterestUp}` and `onInterestDown={handleInterestDown}` from `<FeedPosts>` (lines 367-368).

**`web/src/features/feeds/pages/feeds-list-page.tsx`**:
- Delete `handleInterestUp` and `handleInterestDown` callbacks (lines 249-272).
- Remove `onInterestUp={handleInterestUp}` and `onInterestDown={handleInterestDown}` from `<FeedPosts>` (lines 394-395).

**DO NOT remove** `adjustTagInterest` from `feeds.ts` or `tagInterest` from `endpoints.ts` — the interest suggestions dialog still uses it.

### 8. Frontend — Map `starred` field from API response

Find where `Post` objects are mapped to `FeedPost` objects (search for `my_reaction` or `userReaction` in the web/src code). Add:
```typescript
starred: post.starred ?? false,
```

---

## Summary of delta values after changes

| Action | Old Delta | New Delta |
|---|---|---|
| Star a post (NEW) | — | +10 |
| Manual tag add | +10 | +5 |
| Manual tag label resolve | +10 | +5 |
| Positive reaction | +5 | +3 |
| Negative reaction | -10 | -5 |
| Show more (interest up) | +15 | REMOVED from UI (endpoint kept) |
| Show less (interest down) | -20 | REMOVED from UI (endpoint kept) |

---

## Files to modify

1. `feeds.star` — new `action_post_star`, new `stars` table, migration 27, star state in post responses, updated deltas
2. `app.json` — new route `:feed/-/:post/star`
3. `web/src/api/endpoints.ts` — add `star` endpoint
4. `web/src/api/feeds.ts` — add `starPost` function, export it
5. `web/src/types/posts.ts` — add `starred` to `Post` and `FeedPost`
6. `web/src/features/feeds/components/feed-posts.tsx` — add star button, remove interest up/down props
7. `web/src/features/feeds/pages/entity-feed-page.tsx` — add star handler, remove interest handlers
8. `web/src/features/feeds/pages/feeds-list-page.tsx` — add star handler, remove interest handlers
9. Post-to-FeedPost mapping code (find via `my_reaction` grep) — map `starred` field

## Files NOT to modify

- `web/src/features/feeds/components/interest-suggestions-dialog.tsx` — unchanged, still uses `adjustTagInterest` with `'up'`
- `web/src/features/feeds/components/reaction-bar.tsx` — unchanged
- `web/src/features/feeds/constants.ts` — no "star" reaction type added (star is separate from reactions)
- `@mochi/common` — external library, not modifiable

---

## Build & verification

After making changes:
```bash
cd /home/user/feeds/web && npm run build
```

Check for TypeScript errors. There is no test suite to run.
