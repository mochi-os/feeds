# Mochi Feeds app
# Copyright © 2026 Mochisoft OÜ
# SPDX-License-Identifier: AGPL-3.0-only
# This file is part of Mochi, licensed under the GNU AGPL v3 with the
# Mochi Application Interface Exception - see license.txt and license-exception.md.

# decimal(value) -> bool: whether value is a non-empty ASCII decimal string.
# This is what .isdigit() was reached for, but isdigit() also accepts Unicode
# digit forms (Arabic-Indic "٣", Devanagari "३") that int() rejects,
# which aborts the action as a 500 instead of taking the guard's else branch.
def decimal(value):
    if not value:
        return False
    for c in value.elems():
        if c not in "0123456789":
            return False
    return True

# A peer-supplied numeric field reduced to a real number. Comparing a string
# against an int raises in Starlark and aborts the handler; a non-number becomes
# the default instead (#315).
def number(value, default=0):
    if type(value) in ("int", "float"):
        return value
    return default


# Largest id list bound into one statement. An "id in (?, ?, ...)" clause built
# from a row count grows with the data, and past SQLite's bound-parameter
# ceiling the statement fails outright rather than doing less work, so the ids
# are applied in fixed batches. schedule_scores_refresh already uses limit 500.
BATCH = 500

# Ceiling on a peer-supplied id list, so one event cannot ask this host to
# rewrite an unbounded number of rows.
POSTS_MAXIMUM = 5000


# chunks(items, size) -> list of lists: items split into runs of at most size.
def chunks(items, size):
	out = []
	for i in range(0, len(items), size):
		out.append(items[i:i + size])
	return out


# Block-level and line-break HTML tags whose boundary is a visual break. When
# stripping tags we emit a newline for these so adjacent blocks don't run
# together (e.g. "...benefits.</p><p>While..." must not become
# "...benefits.While..."). Every other tag is inline and simply removed.
strip_html_breaks = [
	"p", "br", "div", "li", "ul", "ol", "dl", "dd", "dt", "tr", "hr", "pre",
	"h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "section", "article",
	"header", "footer", "figure", "figcaption", "table",
]

# remote_error: a core transport failure (marked "transport") becomes a
# translated generic error with the detail logged; a far-end app answer passes
# through unchanged.
def remote_error(a, response, code=502):
	fail(a, remote_failure(response, code))

# remote_failure is a remote's refusal as the (status, label) a helper
# answers: the remote sends a stable label key, localised in the caller's
# language.
def remote_failure(response, code=502):
	if response.get("transport"):
		mochi.log.info("Remote transport error: %s", response.get("error", ""))
		return (response.get("code", code), "errors.remote")
	return (response.get("code", code), response.get("error", "errors.remote"))

# fail answers a helper's refusal, (status, label), as an action's error.
def fail(a, failure):
	a.error.label(failure[0], failure[1])

def strip_html(text):
	if not text:
		return ""
	result = []
	tag = []
	in_tag = False
	for i in range(len(text)):
		c = text[i]
		if in_tag:
			if c == ">":
				in_tag = False
				# Tag name: drop a leading "/" (closing tag), then cut at the first
				# space or "/" so attributes and self-closing slashes are ignored.
				name = "".join(tag).strip()
				if name.startswith("/"):
					name = name[1:]
				cut = len(name)
				for j in range(len(name)):
					if name[j] == " " or name[j] == "\t" or name[j] == "\n" or name[j] == "/":
						cut = j
						break
				if name[:cut].lower() in strip_html_breaks:
					result.append("\n")
			else:
				tag.append(c)
		elif c == "<" and i + 1 < len(text) and (text[i + 1].isalpha() or text[i + 1] in "/!?"):
			# A tag opens only where HTML opens one: "<" before a letter, "/",
			# "!" or "?". Any other "<", and any ">" outside a tag, is text, so
			# "3 < 5" in a plain-text title survives.
			in_tag = True
			tag = []
		else:
			result.append(c)
	out = decode_entities("".join(result))
	# Collapse multiple blank lines into at most two newlines
	while "\n\n\n" in out:
		out = out.replace("\n\n\n", "\n\n")
	return out.strip()

# A feed or item title as one line of plain text. An Atom title of type "html"
# arrives as markup, so it is stripped like a description, and the breaks that
# block tags leave are folded into single spaces.
def strip_title(text):
	return " ".join(strip_html(text).split())

# Decode the HTML entities a feed is likely to carry. Shared by strip_html and
# by attribute reads, which see the same escaping inside a quoted value.
def decode_entities(out):
	out = out.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
	out = out.replace("&quot;", "\"").replace("&#39;", "'").replace("&apos;", "'")
	out = out.replace("&#038;", "&").replace("&nbsp;", " ")
	return out

# The value of `name` on an HTML tag, or "" when absent. Matches only a real
# attribute: the name must start the tag or follow whitespace, so `title=` is
# not found inside `data-title=`. Whitespace either side of the `=` and either
# quote style are accepted, all of which HTML permits.
def html_attribute(tag, name):
	low = tag.lower()
	size = len(tag)
	value_at = -1
	search = 0
	for _ in range(size):
		found = low.find(name, search)
		if found < 0:
			return ""
		starts_attribute = found == 0 or low[found - 1] == " " or low[found - 1] == "\t" or low[found - 1] == "\n"
		after = skip_spaces(tag, found + len(name))
		if starts_attribute and after < size and tag[after] == "=":
			value_at = after + 1
			break
		search = found + 1
	if value_at < 0:
		return ""
	value_at = skip_spaces(tag, value_at)
	if value_at >= size:
		return ""
	quote = tag[value_at]
	if quote != "\"" and quote != "'":
		return ""
	close = tag.find(quote, value_at + 1)
	if close < 0:
		return ""
	return decode_entities(tag[value_at + 1:close]).strip()

# Index of the first non-whitespace character at or after `start`.
def skip_spaces(text, start):
	at = start
	for _ in range(len(text)):
		if at < len(text) and (text[at] == " " or text[at] == "\t" or text[at] == "\n"):
			at = at + 1
		else:
			break
	return at

# The alt/title text of the first image in an HTML fragment, or "". Prefers
# `title`, which is where a web comic puts its punchline.
def image_alt_text(html):
	if not html:
		return ""
	low = html.lower()
	start = low.find("<img")
	if start < 0:
		return ""
	end = low.find(">", start)
	if end < 0:
		return ""
	tag = html[start:end]
	title = html_attribute(tag, "title")
	if title:
		return title
	return html_attribute(tag, "alt")

# Helper: Get feed from request input, validating it exists
def get_feed(a):
    feed = a.input("feed")
    if not feed:
        return None
    row = mochi.db.row("select * from feeds where id=?", feed)
    if not row:
        # Try to find by fingerprint
        row = mochi.db.row("select * from feeds where fingerprint=?", feed)
    return row

# Helper: Build a map of qid -> weight from user interests
def get_interest_map():
	interests = mochi.interests.list()
	m = {}
	for i in interests:
		m[i["qid"]] = i["weight"]
	return m

# Helper: Annotate tags that match a user interest with the interest weight
def enrich_tags(tags, interest_map):
	for t in tags:
		qid = t.get("qid", "")
		if qid and qid in interest_map:
			t["interest"] = interest_map[qid]
	return tags

# Access level hierarchy: comment > react > view
# Each level grants access to that operation and all operations below it.
# "none" explicitly blocks all access (stored as deny rules for all levels).
ACCESS_LEVELS = ["view", "react", "comment"]

# Helper: Check if current user has access to perform an operation
# Uses hierarchical access levels: comment grants react+view, react grants view.
# Users with "manage" or "*" permission automatically have all permissions.
# Subscribers get implicit view/react/comment access.
# A deny row for this subject on this operation, or on every operation. It is
# what access/set level=none writes, and it must beat the implicit subscriber
# grant below: without this the rules the owner set were consulted and then
# overridden by the subscription.
def access_denied(user_id, resource, operation):
    for rule in (mochi.access.list.resource(resource) or []):
        if rule.get("subject") == user_id and rule.get("operation") in (operation, "*") and not rule.get("grant"):
            return True
    return False

def check_access(a, feed_id, operation):
    user = None
    if a.user and a.user.identity:
        user = a.user.identity.id
    return check_access_user(user, feed_id, operation)

# check_access for a user named by their identity, or None for an anonymous
# caller: what an app's function, which has no request, checks with.
def check_access_user(user, feed_id, operation):
    resource = "feed/" + feed_id

    # One call, not five. Each mochi.access.check pays a fixed per-call cost in
    # core - a users.db identity lookup, a db_app_system open, access_setup, a
    # db_user open and a group_memberships walk - and only the resource x
    # operation x subject select is genuinely per-operation. check.any settles
    # each operation exactly as a separate call would, in the same order and
    # over the same resource hierarchy, so the answer is unchanged; only the
    # subject list is built once. This runs per row on the list handlers.
    #
    # ACCESS_LEVELS is ordered lowest to highest: ["view", "react", "comment"],
    # so the tail from the operation's index up grants it.
    operations = ["manage", "*"]
    if operation in ACCESS_LEVELS:
        operations = operations + ACCESS_LEVELS[ACCESS_LEVELS.index(operation):]
    if mochi.access.check.any(user, resource, operations):
        return True

    # Subscribers get implicit access to view/react/comment, unless the owner
    # wrote a deny for them - the rules win over the subscription.
    if operation in ["view", "react", "comment"] and user and not access_denied(user, resource, operation):
        if mochi.db.exists("select 1 from subscribers where feed=? and id=?", feed_id, user):
            return True

    return False

# Helper: Check if remote user (from event header) has access to perform an operation
# Uses same hierarchical levels as check_access.
# Subscribers get implicit view/react/comment access.
def check_event_access(user_id, feed_id, operation):
    resource = "feed/" + feed_id

    # One call, not five - see check_access above for why.
    operations = ["manage", "*"]
    if operation in ACCESS_LEVELS:
        operations = operations + ACCESS_LEVELS[ACCESS_LEVELS.index(operation):]
    if mochi.access.check.any(user_id, resource, operations):
        return True

    # Subscribers get implicit access to view/react/comment, unless the owner
    # wrote a deny for them - the rules win over the subscription.
    if operation in ["view", "react", "comment"] and user_id and not access_denied(user_id, resource, operation):
        if mochi.db.exists("select 1 from subscribers where feed=? and id=?", feed_id, user_id):
            return True

    return False

# Helper: Broadcast event to all subscribers of a feed via the durable
# broadcast log. Sequence + log + gap-detection live in core.
def broadcast_event(feed_id, event, data, exclude=None):
    if not feed_id:
        return
    subscribers = mochi.db.rows("select id from subscribers where feed=?", feed_id)
    subscriber_ids = [sub["id"] for sub in subscribers]
    mochi.broadcast.send(feed_id, feed_id, subscriber_ids, "feeds", event, data, exclude or "")

# error_message_timeout: core calls this when a fan-out to a subscriber aged
# out undelivered. Remove them only when the directory shows no host left
# (locations == 0) - definitely gone, not a transient outage or a server
# migration in progress.
def error_message_timeout(e):
    if e.detail.get("locations", 1) != 0:
        return
    subscriber_remove(e.entity)

# error_subscriber_unreachable: core suspended this subscriber - every
# delivery across the whole evict window failed with no contradicting
# success - and asks us to drop them so fan-out stops paying for a dead
# host. If they return, they re-subscribe.
def error_subscriber_unreachable(e):
    subscriber_remove(e.entity)

# subscriber_remove drops every subscription a gone subscriber holds and
# refreshes the affected feeds' counts.
def subscriber_remove(subscriber):
    affected = mochi.db.rows("select distinct feed from subscribers where id=?", subscriber)
    mochi.db.execute("delete from subscribers where id=?", subscriber)
    for r in affected:
        mochi.db.execute("update feeds set subscribers=(select count(*) from subscribers where feed=?), updated=? where id=?", r["feed"], mochi.time.now(), r["feed"])

# error_broadcast_gap: core calls this when an unfillable broadcast gap was
# skipped and events were permanently lost. broadcast/resync can't replay a
# pruned gap, so pull a fresh full snapshot.
def error_broadcast_gap(e):
    request_resync(e.entity)


# idle_resync_age: idle time without any applied broadcast before the next view
# re-subscribes. Matches core's broadcast_log_age - past it the owner's replay
# log cannot cover us.
idle_resync_age = 7 * 86400

# request_resync pulls a fresh schema dump from the owner when an incoming event
# references data we lack; subscribers only, throttled to once per 60 seconds
# per feed.
def request_resync(feed_id):
    """Returns True iff a fresh schema was actually fetched and applied."""
    row = mochi.db.row("select server, synced from feeds where id=?", feed_id)
    if not row:
        return False
    # Owners are the canonical source; subscribers are the ones who can
    # be out of sync. A subscribed feed has a non-empty server set when
    # the local user joined via action_subscribe.
    if not row["server"]:
        return False
    now = mochi.time.now()
    if row["synced"] and now - row["synced"] < 60:
        return False
    mochi.db.execute("update feeds set synced=? where id=?", now, feed_id)
    peer = mochi.remote.peer(row["server"])
    schema = mochi.remote.request(feed_id, "feeds", "schema", {}, peer)
    if not schema or schema.get("error"):
        return False
    insert_feed_schema(feed_id, schema)
    mochi.broadcast.touch(feed_id)
    fingerprint = mochi.entity.fingerprint(feed_id)
    if fingerprint:
        mochi.websocket.write(fingerprint, {"type": "feed/resynced", "feed": feed_id})
    return True

# maybe_resubscribe re-subscribes an idle remote feed (idle_resync_age). The
# owner's event_subscribe is idempotent and pushes catch-up; touch() stamps the
# timer so a dead owner is poked once per window.
def maybe_resubscribe(a, feed_id):
	user_id = a.user.identity.id if a.user else None
	if not user_id:
		return
	row = mochi.db.row("select server from feeds where id=?", feed_id)
	if not row or not row["server"]:
		return
	if mochi.time.now() - mochi.broadcast.seen(feed_id) <= idle_resync_age:
		return
	registration_send(row["server"], headers(user_id, feed_id, "subscribe"), {"name": a.user.identity.name})
	mochi.broadcast.touch(feed_id)

# Helper: notify feed subscribers over WebSocket, keyed on the fingerprint the
# frontend connects with.
def broadcast_websocket(feed_id, data):
    if not feed_id:
        return

    fingerprint = mochi.entity.fingerprint(feed_id)
    if not fingerprint:
        return

    mochi.websocket.write(fingerprint, data)

def on_db_commit(table, kind, row_uid):
    if not row_uid:
        # Empty when core could not extract a uid from the op's SQL (compound
        # where clauses); no uid, no feed channel. Hard deletes never reach here
        # - the row is gone - so post/delete and tag/remove emit from their
        # handlers.
        return

    msg = None
    feed_id = None

    if table == "posts" and kind in ("insert", "update"):
        row = mochi.db.row("select feed, author from posts where id=?", row_uid)
        if not row:
            return
        feed_id = row["feed"]
        msg_type = "post/create" if kind == "insert" else "post/edit"
        msg = {"type": msg_type, "feed": feed_id, "post": row_uid, "sender": row.get("author", "")}

    elif table == "comments" and kind in ("insert", "update"):
        row = mochi.db.row("select feed, post, subscriber from comments where id=?", row_uid)
        if not row:
            return
        feed_id = row["feed"]
        msg_type = "comment/create" if kind == "insert" else "comment/edit"
        msg = {"type": msg_type, "feed": feed_id, "post": row["post"], "comment": row_uid, "sender": row.get("subscriber", "")}

    elif table == "tags" and kind == "insert":
        tag = mochi.db.row("select object, label, source from tags where id=?", row_uid)
        if not tag:
            return
        post = mochi.db.row("select feed from posts where id=?", tag["object"])
        if not post:
            return
        feed_id = post["feed"]
        msg = {
            "type": "tag/add",
            "feed": feed_id,
            "post": tag["object"],
            "tag": {"id": row_uid, "label": tag["label"], "source": tag["source"]},
        }

    if not msg or not feed_id:
        return

    fingerprint = mochi.entity.fingerprint(feed_id)
    if fingerprint:
        mochi.websocket.write(fingerprint, msg)
    if table in ("posts", "comments"):
        websub_announce(feed_id, table)


def feed_by_id(user_id, feed_id):
	feed_data = mochi.db.row("select * from feeds where id=?", feed_id)
	if not feed_data:
		# Try to find by fingerprint
		feed_data = mochi.db.row("select * from feeds where fingerprint=?", feed_id)

	if not feed_data:
		return None

	if user_id != None:
		feed_data["entity"] = mochi.entity.get(feed_data.get("id"))

	return feed_data

# Helper: Get attachments for a post, falling back to source post attachments for aggregated copies
def post_attachments(post_id, entity_id):
	atts = attachment_list(post_id, entity_id)
	if atts:
		return atts
	# Check if this is a copy from a Mochi feed source (guid is a valid post ID, not an RSS URL)
	sp = mochi.db.row("select guid from source_posts where post=?", post_id)
	if sp and mochi.text.valid(sp["guid"], "id"):
		return attachment_list(sp["guid"], entity_id)
	return []

# Helper: Resolve a feed ID (which might be a fingerprint) to an entity ID
# Returns the entity ID if found, otherwise returns the original input
def resolve_feed_id(feed_id):
	if not feed_id:
		return None

	# If it's already a valid entity ID, return it
	if mochi.text.valid(feed_id, "entity"):
		return feed_id

	# If it's a fingerprint, look up in feeds table
	if mochi.text.valid(feed_id, "fingerprint"):
		row = mochi.db.row("select id from feeds where fingerprint=?", feed_id)
		if row:
			return row["id"]

	return feed_id

# comment_anchor reduces a caller's attachment reference to one this post holds,
# else "". Ids from another post or feed are refused, on HTTP actions and P2P
# events alike.
def comment_anchor(post_id, feed_id, value):
	if type(value) != "string" or not value:
		return ""
	if not attachment_identifier(value):
		return ""
	for att in attachment_list(post_id, feed_id):
		if att["id"] == value:
			return value
	return ""

# comment_anchor_name resolves an anchored comment's attachment to a display
# name (its caption when it has one, else the file name), so a client never
# has to show the raw id. Empty for an unanchored comment or one whose
# attachment has since gone.
def comment_anchor_name(comment):
	anchor = comment.get("attachment", "")
	if not anchor:
		return ""
	att = attachment_get(anchor)
	if not att:
		return ""
	return att.get("caption") or att.get("name", "")

# comment_anchor_caption is the anchored attachment's caption alone - "" when
# it has none - so a client can show a caption as text but keep a bare file
# name to a hover: readers care what an image is, rarely what it was called.
def comment_anchor_caption(comment):
	anchor = comment.get("attachment", "")
	if not anchor:
		return ""
	att = attachment_get(anchor)
	if not att:
		return ""
	return att.get("caption", "")

# feed_comments builds the whole comment tree for one post. It fetches every
# comment for the post in a single query and assembles the tree in memory,
# batching attachments, anchor lookups and reactions across the whole set. It
# used to recurse a level at a time, issuing ~6 queries per comment; a busy
# thread cost hundreds of round trips per post, and action_view calls it per
# post on the page. parent_id/depth are kept for the signature; callers always
# pass the root (None, 0).
def feed_comments(user_id, post_data, parent_id, depth):
	if parent_id == None:
		parent_id = ""

	all_comments = mochi.db.rows("select * from comments where post=? order by created desc", post_data["id"])
	if not all_comments:
		return []

	comment_ids = [c["id"] for c in all_comments]
	places = ", ".join(["?" for _ in comment_ids])

	# Attachments on the comments themselves - one query, grouped by comment id.
	attachments_by_comment = attachment_list_many(comment_ids, post_data["feed"])

	# The post attachment a comment is anchored to - one query for the whole set.
	# Both the display name and the caption come from this single row (was two
	# attachment_get calls per comment for the same attachment).
	anchors = attachment_get_many([c.get("attachment", "") for c in all_comments])

	# Reactions on the comments - one query, grouped by comment id. A removed
	# reaction is a deleted row, so reaction!='' captures every live reaction.
	reactions_by_comment = {}
	for row in mochi.db.rows("select * from reactions where comment in (" + places + ") and reaction!=''", *comment_ids) or []:
		reactions_by_comment.setdefault(row["comment"], []).append(row)

	children_by_parent = {}
	for c in all_comments:
		c["feed_fingerprint"] = mochi.entity.fingerprint(c["feed"])
		if c.get("format", "text") == "markdown":
			c["body_markdown"] = mochi.text.markdown(c["body"])
		c["user"] = user_id or ""
		c["attachments"] = attachments_by_comment.get(c["id"], [])

		anchor = c.get("attachment", "")
		att = anchors.get(anchor) if anchor else None
		if att:
			c["attachment_name"] = att.get("caption") or att.get("name", "")
			c["attachment_caption"] = att.get("caption", "")
		else:
			c["attachment_name"] = ""
			c["attachment_caption"] = ""

		reactions = reactions_by_comment.get(c["id"], [])
		if user_id:
			mine = ""
			others = []
			for r in reactions:
				if r["subscriber"] == user_id:
					mine = r["reaction"]
				else:
					others.append(r)
			c["my_reaction"] = mine
			c["reactions"] = others
		else:
			c["my_reaction"] = ""
			c["reactions"] = reactions

		# Guard against a self-parented row so the tree cannot become cyclic.
		if c["parent"] != c["id"]:
			children_by_parent.setdefault(c["parent"], []).append(c)

	# order by created desc above preserves each sibling group's original order.
	for c in all_comments:
		c["children"] = children_by_parent.get(c["id"], [])

	return children_by_parent.get(parent_id, [])

def is_reaction_valid(reaction):
	# "none" or empty means remove reaction
	if not reaction or reaction == "none":
		return {"valid": True, "reaction": ""}
	if mochi.text.valid(reaction, "^(like|dislike|laugh|amazed|love|sad|angry|agree|disagree)$"):
		return {"valid": True, "reaction": reaction}
	return {"valid": False, "reaction": ""}

# Stream an entity's asset from its owning service; mochi.remote.stream() loops back
# in-process for a local entity. Binary assets are header + bytes, JSON assets a
# single write with "data".
def stream_asset(a, entity_id, service, asset):
	if not entity_id:
		a.error.label(404, "errors.asset_unavailable", asset=asset, log=False)
		return None
	s = mochi.remote.stream(entity_id, service, asset, {})
	if not s:
		a.error.label(404, "errors.asset_unavailable", asset=asset, log=False)
		return None
	header = s.read()
	if not header or header.get("status") != "200":
		a.error.label(404, "errors.asset_not_set", asset=asset, log=False)
		return None
	a.header("Cache-Control", "private, max-age=300")
	if "data" in header:
		return {"data": header["data"]}
	a.header("Content-Type", header.get("content_type", "application/octet-stream"))
	# Per-slot byte caps matching what the people app accepts on upload; the route
	# is public, so an uncapped stream could run indefinitely. Unknown slots fall
	# back to the largest cap.
	caps = {"avatar": 2 * 1024 * 1024, "banner": 10 * 1024 * 1024, "favicon": 64 * 1024}
	a.write.stream(s, maximum=caps.get(asset, 10 * 1024 * 1024))
	return None

def feed_update(user_id, feed_data):
	feed_id = feed_data["id"]
	# Use atomic subquery to avoid race condition
	mochi.db.execute("update feeds set subscribers=(select count(*) from subscribers where feed=?), updated=? where id=?", feed_id, mochi.time.now(), feed_id)

	# Fan the roster count out through the durable broadcast log rather than one
	# direct message per subscriber: one send instead of N, and it survives an
	# offline subscriber to be healed on the next gap check (#325).
	subscriber_count = mochi.db.row("select count(*) as n from subscribers where feed=?", feed_id)["n"]
	broadcast_event(feed_id, "update", {"subscribers": subscriber_count}, user_id)

# Send recent posts to a new subscriber
# Batches database queries to avoid N+1 pattern
def send_recent_posts(user_id, feed_data, subscriber_id):
	feed_id = feed_data["id"]
	feed_posts = mochi.db.rows("select * from posts where feed=? order by created desc limit 100", feed_id)
	if not feed_posts:
		return

	# Collect all post IDs for batch queries
	post_ids = [p["id"] for p in feed_posts]

	# Batch fetch all comments and reactions for all posts in this feed
	all_comments = mochi.db.rows("select * from comments where feed=? order by created", feed_id)
	all_reactions = mochi.db.rows("select * from reactions where feed=?", feed_id)

	# Index comments by post
	comments_by_post = {}
	for c in all_comments:
		c["attachment_name"] = comment_anchor_name(c)
		c["attachment_caption"] = comment_anchor_caption(c)
		pid = c.get("post", "")
		if pid not in comments_by_post:
			comments_by_post[pid] = []
		comments_by_post[pid].append(c)

	# Index reactions by post and by comment
	post_reactions = {}
	comment_reactions = {}
	for r in all_reactions:
		pid = r.get("post", "")
		cid = r.get("comment", "")
		if cid:
			if cid not in comment_reactions:
				comment_reactions[cid] = []
			comment_reactions[cid].append(r)
		else:
			if pid not in post_reactions:
				post_reactions[pid] = []
			post_reactions[pid].append(r)

	# Batch fetch all tags for posts in this feed
	all_tags = mochi.db.rows("select id, object, label, qid, relevance, source from tags where object in (select id from posts where feed=?)", feed_id) or []
	tags_by_post = {}
	for t in all_tags:
		pid = t.get("object", "")
		if pid not in tags_by_post:
			tags_by_post[pid] = []
		tags_by_post[pid].append(t)

	# Send posts with their comments, reactions, and tags
	for post in feed_posts:
		post_id = post["id"]
		post["sync"] = True
		post["attachments"] = attachment_list(post_id, feed_id)
		post["copies"] = copies_present(post_id)
		# Parse data from JSON string so receiver gets a dict (not a double-encoded string)
		if post.get("data") and type(post["data"]) == type(""):
			post["data"] = json.decode(post["data"], None) or {}
		# Include tags inline with the post so subscriber gets them atomically
		post_tags = tags_by_post.get(post_id, [])
		if post_tags:
			post["tags"] = [{"id": t["id"], "label": t["label"], "qid": t.get("qid", ""), "relevance": t.get("relevance", 0), "source": t.get("source", "manual")} for t in post_tags]
		mochi.message.send(headers(feed_id, subscriber_id, "post/create"), post)

		# Send comments for this post
		for c in comments_by_post.get(post_id, []):
			c["sync"] = True
			c["attachments"] = attachment_list(c["id"], feed_id)
			mochi.message.send(headers(feed_id, subscriber_id, "comment/create"), c)

			# Send reactions for this comment
			for r in comment_reactions.get(c["id"], []):
				mochi.message.send(
					headers(feed_id, subscriber_id, "comment/react"),
					{"feed": feed_id, "post": post_id, "comment": c["id"], "subscriber": r["subscriber"], "name": r["name"], "reaction": r["reaction"], "sync": True}
				)

		# Send post-level reactions
		for r in post_reactions.get(post_id, []):
			mochi.message.send(
				headers(feed_id, subscriber_id, "post/react"),
				{"feed": feed_id, "post": post_id, "subscriber": r["subscriber"], "name": r["name"], "reaction": r["reaction"], "sync": True}
			)

# Does the current user own this feed entity?
# Source of truth is core/users.db.entities — the private key bearer is the owner.
def owned(feed_id):
	return len(mochi.entity.get(feed_id)) > 0

# Produce a share link for a feed the caller owns: mochi://<server-peer>/<feed>.
# The peer is this server's libp2p id, so a recipient can subscribe to a PRIVATE
# feed (not directory-listed) by pasting the link - the peer bootstraps first
# contact, after which the learned directory sustains delivery (#209).
def action_share(a): # feeds_share
	if not a.user.identity.id:
		a.error.label(401, "errors.not_logged_in")
		return
	feed_id = a.input("feed")
	if not mochi.text.valid(feed_id, "entity"):
		a.error.label(400, "errors.invalid_id")
		return
	if not owned(feed_id):  # gated on a.user above - safe from the anonymous-owner trap
		a.error.label(403, "errors.access_denied")
		return
	peer = mochi.server.id()
	return {"data": {"link": "mochi://" + peer + "/" + feed_id, "peer": peer, "feed": feed_id}}

# Build a set of feed IDs the current user owns, for batched checks in list views.
def owned_set():
	return {e["id"]: True for e in mochi.entity.owned() if e.get("class") == "feed"}

# Readers json.decode a post's `data` everywhere and Starlark has no try/except,
# so a remote owner's unparseable value would abort every handler touching the
# post. Store the re-encoded parse, or nothing.
# clean_post_data plus the rss.link sanitising the create and edit paths do.
# Used where the data comes straight from a peer's schema dump: re-encoding
# alone leaves an unsafe link scheme intact, and it executes on click.
def safe_post_data(value):
	decoded = value
	if type(decoded) == "string":
		decoded = json.decode(decoded, None) if decoded else None
	if type(decoded) != "dict":
		return ""
	return json.encode(sanitize_post_data(decoded))


def clean_post_data(value):
	if type(value) == "dict":
		return json.encode(value)
	if type(value) != "string" or not value:
		return ""
	decoded = json.decode(value, None)
	if type(decoded) != "dict":
		return ""
	return json.encode(decoded)

# Columns of `feeds` any viewer may see; the rest is owner configuration. A
# whitelist so a column added later is private by default.
FEED_FIELDS_PUBLIC = ["id", "name", "privacy", "subscribers", "updated", "fingerprint", "banner", "sort", "populated"]
FEED_FIELDS_OWNER = ["server", "read", "ai_mode", "ai_account", "ai_prompt_new", "ai_prompt_rank", "synced"]

# Project a feed row down to what the caller is entitled to see.
def feed_visible(feed, is_owner):
	if feed == None:
		return None
	out = {}
	for field in FEED_FIELDS_PUBLIC:
		if field in feed:
			out[field] = feed[field]
	if is_owner:
		for field in FEED_FIELDS_OWNER:
			if field in feed:
				out[field] = feed[field]
		if feed.get("id"):
			out["publish"] = publish_list(feed["id"])
	return out

def is_feed_owner(user_id, feed_data):
	if feed_data == None or not user_id:
		return False
	feed_id = feed_data.get("id")
	if not feed_id:
		return False
	return owned(feed_id)

# Helper: Check if user is subscribed to a feed
def is_user_subscribed(user_id, feed_entity_id):
	if not user_id or not feed_entity_id:
		return False
	return mochi.db.exists("select 1 from subscribers where feed=? and id=?", feed_entity_id, user_id)

def get_user_feeds(user_id):
	owned_ids = owned_set()
	all_local = mochi.db.rows("select * from feeds order by updated desc")
	owned_feeds = [f for f in all_local if owned_ids.get(f["id"])]
	subscribed_feeds = mochi.db.rows("""
		select f.* from feeds f
		inner join subscribers s on f.id = s.feed
		where s.id = ?
		order by f.updated desc
	""", user_id)
	seen_feed_ids = set()
	user_feeds = []
	for feed in owned_feeds:
		feed["fingerprint"] = mochi.entity.fingerprint(feed["id"])
		feed["isSubscribed"] = False
		feed["owner"] = 1
		user_feeds.append(feed)
		seen_feed_ids.add(feed["id"])
	for feed in subscribed_feeds:
		if feed["id"] not in seen_feed_ids:
			feed["fingerprint"] = mochi.entity.fingerprint(feed["id"])
			feed["isSubscribed"] = True
			feed["owner"] = 0
			user_feeds.append(feed)
			seen_feed_ids.add(feed["id"])
	# Add unread counts
	for feed in user_feeds:
		feed_read = feed.get("read", 0)
		row = mochi.db.row("select count(*) as n from posts where feed=? and read=0 and created>?", feed["id"], feed_read)
		feed["unread"] = row["n"] if row else 0
	return sorted(user_feeds, key=lambda f: -f.get("updated", 0))

def set_feed_updated(feed_id, ts = -1):
	if ts == -1:
		ts = mochi.time.now()
	mochi.db.execute("update feeds set updated=? where id=?", ts, feed_id)
	
def set_post_updated(post_id, ts = -1):
	if ts == -1:
		ts = mochi.time.now()
	mochi.db.execute("update posts set updated=? where id=?", ts, post_id)

def get_feed_subscriber(feed_data, subscriber_id):
	sub_data = mochi.db.row("select * from subscribers where feed=? and id=?", feed_data["id"], subscriber_id)
	if not sub_data or len(sub_data) == 0:
		return None
	return sub_data

def post_reaction_set(post_data, subscriber_id, name, reaction):
	if reaction:
		mochi.db.execute("replace into reactions ( feed, post, subscriber, name, reaction ) values ( ?, ?, ?, ?, ? )", post_data["feed"], post_data["id"], subscriber_id, name, reaction)
	else:
		mochi.db.execute("delete from reactions where feed=? and post=? and comment='' and subscriber=?", post_data["feed"], post_data["id"], subscriber_id)
	
	# Update cached scores for ranking
	update_post_scores(post_data["id"])

	# Update user interests from reaction
	positive = reaction in ["like", "love", "thumbsup", "star"]
	update_interests_from_reaction(post_data["id"], positive)

	set_post_updated(post_data["id"])
	set_feed_updated(post_data["feed"])

# Helper: Update cached scores in posts table based on reactions
def update_post_scores(post_id):
	# Map reactions to up/down
	reactions = mochi.db.rows("select reaction from reactions where post=? and comment=''", post_id)
	up = 0
	down = 0
	for r in reactions:
		reaction = r["reaction"]
		if reaction in ["like", "love", "laugh", "amazed", "agree"]:
			up += 1
		elif reaction in ["dislike", "sad", "angry", "disagree"]:
			down += 1
	mochi.db.execute("update posts set up=?, down=? where id=?", up, down, post_id)

VALID_SORTS = ["", "new", "hot", "top", "interests", "ai", "relevant"]

# Helper: Get post sort order based on sort type
def get_post_order(sort):
	if sort == "top":
		return "(up - down) desc, created desc"
	if sort == "hot":
		# score / (age_in_hours + 2)
		# Use max(..., 1) to prevent divide by zero if created time is in the future due to clock skew
		return "((up - down) + 1) / max(((" + str(mochi.time.now()) + " - created) / 3600) + 2, 1) desc, created desc"
	# Default is "new" (also used as fallback for ai/interests/relevant which do post-query sorting)
	return "created desc"

def comment_reaction_set(comment_data, subscriber_id, name, reaction):
	if reaction:
		mochi.db.execute("replace into reactions ( feed, post, comment, subscriber, name, reaction ) values ( ?, ?, ?, ?, ?, ? )", comment_data["feed"], comment_data["post"], comment_data["id"], subscriber_id, name, reaction)
	else:
		mochi.db.execute("delete from reactions where feed=? and post=? and comment=? and subscriber=?", comment_data["feed"], comment_data["post"], comment_data["id"], subscriber_id)
	set_post_updated(comment_data["post"])
	set_feed_updated(comment_data["feed"])

def headers(from_id, to_id, event):
	return {"from": from_id, "to": to_id, "service": "feeds", "event": event}

# Send a subscribe/unsubscribe to an owner whose entity may not resolve (private
# entities never list, public entries expire offline). A stored "p2p/<peer>"
# server pins the queue row to that peer so the send parks until it reconnects;
# hostname servers still route via the directory.
def registration_send(server, headers, content):
	peer = server[len("p2p/"):] if server and server.startswith("p2p/") else ""
	if peer:
		mochi.message.send.peer(peer, headers, content)
	else:
		mochi.message.send(headers, content)

# Validate and clean a tag label
def validate_tag(label):
	if not label:
		return None
	label = label.strip().lower()
	if not label or len(label) > 50:
		return None
	for ch in label.elems():
		if not (ch.isalpha() or ch.isdigit() or ch == " " or ch == "-" or ch == "/"):
			return None
	return label

# Check if a user can tag a post in a feed
def can_tag_post(user_id):
	# Any logged-in user can tag posts (tags are local); the caller has already
	# resolved the feed and verified the post belongs to it.
	if user_id:
		return True
	return False

# Extract http(s) URLs from free text (brackets, parens and quotes treated as
# delimiters so markdown and HTML links are picked up)
def extract_urls(text):
	if not text:
		return []
	cleaned = text
	for ch in ["\n", "\t", "(", ")", "<", ">", '"', "'", "[", "]", ","]:
		cleaned = cleaned.replace(ch, " ")
	urls = []
	for token in cleaned.split(" "):
		if token.startswith("http://") or token.startswith("https://"):
			urls.append(token)
	return urls

# Reduce a URL to its host (scheme, path, credentials, port and leading www.
# stripped), lowercased
def url_domain(url):
	if not url:
		return ""
	if "://" in url:
		url = url[url.index("://") + 3:]
	for sep in ["/", "?", "#"]:
		if sep in url:
			url = url[:url.index(sep)]
	if "@" in url:
		url = url[url.index("@") + 1:]
	if ":" in url:
		url = url[:url.index(":")]
	if url.startswith("www."):
		url = url[4:]
	return url.lower()

# Collect unique domains from a list of URLs, preserving order
def collect_domains(urls):
	domains = []
	seen = {}
	for url in urls:
		domain = url_domain(url)
		if domain and domain not in seen:
			seen[domain] = True
			domains.append(domain)
	return domains

# Default AI prompts
AI_PROMPT_NEW = "Extract the key entities and topics (up to 10) from this post, with canonical English names and relevance scores (0-100). Prefer well-known entities and broad topics that would have their own Wikipedia article (e.g. 'technology', 'sport', 'football') over compound phrases or niche terms. Prefer singular forms. Include specific names only when they are the central subject.\n\nIf a post is an advertisement, deal, sponsored content, product promotion, shopping guide, or deals roundup (e.g. 'best deals', 'on sale now', 'save $X'), include 'advertising' as an entity with high relevance.\n\nIf the title uses clickbait patterns, include 'clickbait' as an entity with high relevance. Patterns: vague demonstratives ('this', 'these'), withholding ('you won\\'t believe', 'what happened next', 'not what you think'), emotional bait ('will blow your mind', 'will shock you', 'changed my life'), affiliate language ('you need to know', 'we tested', 'we found').\n\nEach post may be prefixed in brackets with its source publication and any linked domains. When the source, or a linked domain, corresponds to a well-known company, publication, or institution, include it as an entity with moderate relevance (around 40-60). Do not create a tag from a generic, unrecognised, or link-shortener domain.\n\nIf a post should be dropped entirely (e.g. it is empty, a cookie notice, a paywall message, or pure spam with no editorial content), set \"drop\": true.\n\nReturn JSON only:\n[{\"index\": 0, \"drop\": false, \"entities\": [{\"name\": \"Germany\", \"relevance\": 90}]}]\n\nPosts:\n{{posts}}"
AI_PROMPT_STORY = "A feed has received a new post. Decide whether it reports exactly the same news as one of the earlier posts listed below.\n\nTwo posts report the same news only when both report the same single event, announcement, release or decision. They are different stories when they only share a topic, subject, person, organisation, place or product; when one reports a reaction to, consequence of or follow-up to the other; when they cover different days or stages of something ongoing, such as a trial, war, campaign or investigation; or when one is an opinion piece, review, guide or roundup and the other a news report. If you are not certain, answer null: a missed match only shows the reader a second post, but a wrong match hides a different story from them.\n\nIf it is the same news, also decide whether the new post is a better account of it than that earlier post: more complete, clearer and more informative, from a source at least as credible. Each post shows its source, the source's credibility rating (0-100) and when it was published.\n\nNew post:\n{{post}}\n\nEarlier posts:\n{{posts}}\n\nReturn JSON only:\n{\"story\": <number or null>, \"event\": \"<the event>\", \"better\": <true or false>}\n\n\"story\" is the number of the earlier post that reports the same news, or null if none does. \"event\" names, in a few words, the single event both posts report, and is empty when \"story\" is null. \"better\" is true only if the new post is the better account."
AI_PROMPT_RANK = "Given a user's interests and a list of posts, score each post 0-100 based on relevance to the user.\nEach post has a credibility rating (0-100). Apply credibility linearly: a post with credibility 70 should have its score multiplied by 70%, credibility 50 by 50%. A post with credibility 100 is unaffected.\n\nUser interests: {{interests}}\n\nPosts:\n{{posts}}\n\nReturn JSON only, one score per post in order:\n[{\"index\": 0, \"score\": 85}, ...]"
AI_PROMPT_CREDIBILITY = "Rate the factual credibility of this news source on a scale of 0 to 100.\nSource: {{source}}\nDomain: {{domain}}\nGuidelines:\n- 85-100: Wire services, major quality broadsheets\n- 60-84: Established outlets with good editorial standards\n- 40-59: Mixed record, some editorial concerns\n- 20-39: Frequent accuracy issues or strong ideological slant\n- 0-19: Known misinformation or propaganda sources\nIf you do not recognise the source, respond with 60.\nRespond with only the integer score, nothing else."

AI_PROMPT_DEFAULTS = {
	"new": AI_PROMPT_NEW,
	"rank": AI_PROMPT_RANK,
	"credibility": AI_PROMPT_CREDIBILITY,
}

# Get custom AI prompt for a feed entity, or return default
def get_ai_prompt(feed_id, prompt_type):
	col = "ai_prompt_" + prompt_type
	row = mochi.db.row("select " + col + " from feeds where id=?", feed_id)
	if row and row.get(col, ""):
		return row[col]
	return AI_PROMPT_DEFAULTS.get(prompt_type, "")

# Get custom AI prompt from user preferences, or return default
def get_user_ai_prompt(a, prompt_type):
	custom = a.user.preference.get("ai_prompt_" + prompt_type)
	if custom:
		return custom
	return AI_PROMPT_DEFAULTS.get(prompt_type, "")

# Resolve AI account: 0 means use default AI account
def resolve_ai_account(ai_account):
	# Account ids are strings now; the stored value may be the legacy integer read
	# back from the integer-affinity column (0 = none), so normalise to a string id.
	ai_account = str(ai_account) if ai_account else ""
	if ai_account:
		return ai_account
	accounts = mochi.account.list("ai")
	if not accounts:
		return ""
	for acc in accounts:
		if "ai" in acc.get("default", "").split(","):
			return acc["id"]
	return accounts[0]["id"]

# A post as an AI prompt sees it: the title once, then up to `limit` characters
# of the rest. An RSS post's body begins with its own title, so prefixing the
# title as well spent the limit on a second copy of it.
def post_prompt(post, limit):
	data = json.decode(post.get("data", "") or "{}", None)
	if type(data) != "dict":
		data = {}
	rss = data.get("rss", {})
	if type(rss) != "dict":
		rss = {}
	title = (data.get("title", "") or rss.get("title", "") or "").strip()
	body = (post.get("body", "") or "").strip()
	if title and body.startswith(title):
		body = body[len(title):]
	body = " ".join(body.split())
	if len(body) > limit:
		body = body[:limit]
	if title and body:
		return title + ": " + body
	return title or body

# Transform a post using AI before ingestion
# Returns (action, fields) where action is "continue" or "drop"
def transform_post(transform, feed_id, fields):
	if not transform:
		return ("continue", fields)
	feed_row = mochi.db.row("select ai_account from feeds where id=?", feed_id)
	if not feed_row:
		return ("continue", fields)
	account = resolve_ai_account(feed_row.get("ai_account", 0))
	if not account:
		return ("continue", fields)
	# The image_text note is descriptive, not an instruction: the owner's own
	# instruction still decides what happens. Without it the field arrives
	# unexplained and an instruction that says "use the image's caption" has no
	# way to know where to look.
	prompt = "You are processing a post from a feed source. Apply the source owner's instruction to the post.\n\n<post>\n" + json.encode(fields) + "\n</post>\n\nA post may carry an \"image_text\" field. That is the alt or title text of the post's only image, present when the post has no description of its own - a web comic's caption, for instance.\n\n<instruction>\n" + transform + "\n</instruction>\n\nRespond with a JSON object with these fields:\n- \"action\": \"continue\" to include this post, or \"drop\" to exclude it\n- \"post\": the modified post fields (same keys as the input, required when action is \"continue\")\n\nReturn ONLY a valid JSON object."
	result = mochi.ai.prompt(prompt, account=account)
	if result["status"] != 200 or not result.get("text", ""):
		return ("continue", fields)
	text = result["text"].strip()
	if text.startswith("```"):
		first_newline = text.index("\n") if "\n" in text else 3
		text = text[first_newline + 1:]
		if text.endswith("```"):
			text = text[:-3].strip()
	while text.startswith("`"):
		text = text[1:]
	while text.endswith("`"):
		text = text[:-1]
	text = text.strip()
	if not text.startswith("{"):
		return ("continue", fields)
	parsed = json.decode(text, None)
	if not parsed:
		return ("continue", fields)
	action = parsed.get("action", "continue")
	if action == "drop":
		return ("drop", fields)
	post_fields = parsed.get("post")
	if type(post_fields) == "dict" and post_fields:
		merged = dict(fields)
		for k in post_fields:
			merged[k] = post_fields[k]
		return ("continue", merged)
	return ("continue", fields)

# Tag a post using AI, storing results as AI tags
def ai_tag_post(feed_id, post_id):
	feed_data = mochi.db.row("select * from feeds where id=?", feed_id)
	if not feed_data or feed_data.get("ai_mode", "") == "":
		return
	account = resolve_ai_account(feed_data.get("ai_account", 0))
	if not account:
		return
	post = mochi.db.row("select id, body, data from posts where id=?", post_id)
	if not post:
		return
	body = post["body"]
	if len(body) < 20:
		return
	source_name = ""
	link = ""
	image = ""
	if post.get("data"):
		data = json.decode(post["data"], None) or {}
		rss = data.get("rss", {})
		source_name = rss.get("source", "")
		link = rss.get("link", "")
		image = rss.get("image", "")
	text = post_prompt(post, 500)
	# Surface the source publication and any linked domains so the AI can tag
	# recognisable publishers (resolved via QID; unrecognised domains drop out)
	domains = collect_domains(([link] if link else []) + extract_urls(body))
	context = []
	if source_name:
		context.append("source: " + source_name)
	if domains:
		context.append("links: " + ", ".join(domains))
	prefix = ("[" + " | ".join(context) + "] ") if context else ""
	prompt = get_ai_prompt(feed_id, "new").replace("{{posts}}", "0. " + prefix + text)
	result = mochi.ai.prompt(prompt, account=account)
	if result["status"] != 200:
		mochi.log.debug("ai_tag_post: AI call failed post=" + post_id + " status=" + str(result["status"]) + " text=" + str(result.get("text", ""))[:500])
		return
	items = parse_unified_tag_response(result["text"])
	if not items:
		mochi.log.debug("ai_tag_post: AI response unparseable post=" + post_id + " raw=" + str(result.get("text", ""))[:500])
		return
	entry = items[0] if items else None
	if not entry:
		return
	# The AI drop rule filters RSS residue (ads, cookie notices, paywalls). Never
	# drop a directly-authored post, an image post (the prompt cannot see its
	# substance), or a transformed source's post (its drop decision was applied at
	# ingestion). Keep the source_posts row so the guid stays seen.
	if entry.get("drop"):
		source = mochi.db.row("select s.transform from sources s join source_posts sp on sp.source=s.id where sp.post=?", post_id)
		if not source:
			mochi.log.info("ai_tag_post: ignoring AI drop for directly-authored post %s", post_id)
		elif image:
			mochi.log.info("ai_tag_post: ignoring AI drop for image post %s", post_id)
		elif source["transform"]:
			mochi.log.info("ai_tag_post: ignoring AI drop for transformed source post %s", post_id)
		else:
			mochi.log.info("ai_tag_post: AI dropped source post %s", post_id)
			mochi.db.execute("delete from posts where id=?", post_id)
			mochi.db.execute("delete from follows where post=?", post_id)
			return "drop"

	entities = entry.get("entities", [])
	if not entities:
		return
	inserted = 0
	qid_dup = 0
	names = []
	# One batched broadcast for every tag added in this pass, not one per tag.
	tag_updates = []
	# Resolve each entity name to a Wikidata QID via search (ignore AI-provided QIDs)
	for item in entities:
		label = item["name"].lower()
		names.append(item["name"])
		results = mochi.qid.search(item["name"], "en")
		if not results:
			continue
		qid = results[0]["qid"]
		# Skip if this post already has a tag for this QID (different label, same entity)
		if mochi.db.exists("select 1 from tags where object=? and qid=?", post_id, qid):
			qid_dup += 1
			continue
		inserted += 1
		tag_id = mochi.uid()
		mochi.db.execute(
			"insert or ignore into tags (id, object, label, qid, relevance, source) values (?, ?, ?, ?, ?, 'ai')",
			tag_id, post_id, label, qid, item["relevance"]
		)
		tag_updates.append({"id": tag_id, "object": post_id, "label": label, "qid": qid, "relevance": item["relevance"], "source": "ai"})
	if inserted == 0 and qid_dup == 0:
		mochi.log.debug("ai_tag_post: no QIDs resolved for any entity post=" + post_id + " names=" + str(names))

	# One batched broadcast per AI tag pass. Subscribers on new
	# versions apply via event_tag_add_batch; older subscribers ignore
	# the event and miss the AI tags until they upgrade.
	if tag_updates:
		broadcast_event(feed_id, "tag/add/batch", {"items": tag_updates})

# Parse the tagging AI response: [{"index": N, "drop": bool, "entities": [{"name": "...", "relevance": N}]}]
def parse_unified_tag_response(text):
	text = text.strip()
	if text.startswith("```"):
		lines = text.split("\n")
		text = "\n".join(lines[1:-1]).strip()
	# Strip any remaining backticks wrapping the JSON
	while text.startswith("`"):
		text = text[1:]
	while text.endswith("`"):
		text = text[:-1]
	text = text.strip()
	if not text.startswith("["):
		return []
	# Handle potentially truncated JSON by finding the last complete entry
	if not text.endswith("]"):
		last_close = text.rfind("}]")
		if last_close < 0:
			return []
		text = text[:last_close + 2]
	items = json.decode(text, None)
	if type(items) != "list" or not items:
		return []
	result = []
	for item in items:
		if type(item) != "dict":
			continue
		idx = item.get("index", 0)
		entities = []
		found = item.get("entities", [])
		if type(found) != "list":
			found = []
		for e in found:
			if type(e) != "dict":
				continue
			name = e.get("name", "")
			relevance = e.get("relevance", 0)
			if not name or type(name) != "string":
				continue
			if type(relevance) not in ("int", "float"):
				continue
			relevance = int(relevance)
			if relevance < 0 or relevance > 100:
				continue
			entity = {"name": name, "relevance": relevance}
			qid = e.get("qid", "")
			if qid and type(qid) == "string":
				entity["qid"] = qid
			entities.append(entity)
		drop = item.get("drop", False) == True
		result.append({"index": idx, "entities": entities[:10], "drop": drop})
	return result

# Scheduled event handler for AI tagging (manual posts, aggregating feed copies, RSS posts)
def schedule_ai_tag(e):
	if e.source != "schedule":
		return
	feed_id = e.data.get("feed", "")
	post_id = e.data.get("post", "")
	if feed_id and post_id:
		if ai_tag_post(feed_id, post_id) == "drop":
			return

		# Broadcast post to subscribers if deferred from RSS ingestion
		if e.data.get("broadcast"):
			post = mochi.db.row("select * from posts where id=?", post_id)
			if post:
				data = json.decode(post["data"], None) or {} if post.get("data") else {}
				post_event = {"id": post_id, "created": post["created"], "body": post["body"], "data": data, "credibility": post.get("credibility", 100)}
				tags = mochi.db.rows("select id, label, qid, relevance, source from tags where object=?", post_id) or []
				if tags:
					post_event["tags"] = [{"id": t["id"], "label": t["label"], "qid": t.get("qid", ""), "relevance": t.get("relevance", 0), "source": t.get("source", "")} for t in tags]
				user_id = e.user.identity.id if e.user else None
				broadcast_event(feed_id, "post/create", post_event, user_id)
				broadcast_websocket(feed_id, {"type": "post/create", "feed": feed_id, "post": post_id})

		# Score post for the owner now that tags are available
		viewer_id = e.user.identity.id if e.user else None
		if viewer_id:
			score_posts_for_viewer([post_id], viewer_id)

		# Place the post in a story now that its tags exist. Placement takes one
		# post at a time per feed (see story_drain), so it is queued rather than
		# done here.
		if mochi.db.exists("select 1 from feeds where id=? and ai_mode='tag+deduplicate'", feed_id):
			mochi.db.execute("insert or ignore into placements (post, feed, queued) values (?, ?, ?)", post_id, feed_id, mochi.time.now())
			mochi.schedule.after("schedule_story", {"feed": feed_id}, 0)

# Scheduled event handler for background AI reranking
def schedule_ai_rerank(e):
	if e.source != "schedule":
		return
	feed_id = e.data.get("feed", "")
	if feed_id:
		ai_rerank_batch(feed_id)

# Scheduled event handler for background re-scoring of interest scores.
# Triggered when a user's interests change (detected at view time).

def schedule_scores_refresh(e):
	if e.source != "schedule":
		return
	viewer_id = e.data.get("viewer", "")
	if not viewer_id:
		return
	# Find the latest interest update time
	all_interests = mochi.interests.list()
	max_interest_updated = 0
	for i in all_interests:
		u = i.get("updated", 0)
		if u > max_interest_updated:
			max_interest_updated = u
	if max_interest_updated == 0:
		return

	# Re-score posts with stale scores (computed before the interest change)
	rows = mochi.db.rows(
		"select post as id from post_scores where viewer = ? and computed < ? order by computed asc limit 500",
		viewer_id, max_interest_updated
	) or []
	if rows:
		score_posts_for_viewer([r["id"] for r in rows], viewer_id)

# Near-duplicate posts are grouped into stories. A post that reports nothing
# earlier in the feed starts a story, named by the post's own id; a post that
# reports the same story as an earlier one joins it. Only a story's best post
# keeps full novelty, so the ranking shows one account of each story, and a
# better account arriving later takes over unless the reader has already seen
# the story.

# How far back a new post looks for its story, in seconds.
STORY_WINDOW = 259200

# The most stories one placement shows the AI.
STORY_CANDIDATES = 15

# Novelty of a story's posts other than its best.
STORY_DUPLICATE = 10

# Seconds one placement pass may run before leaving the rest to a follow-up.
STORY_BUDGET = 50

# Output tokens for the story decision: room for a thinking model's reasoning
# before its short answer.
STORY_TOKENS = 4096

# A post's line in the story prompt: its source, the source's credibility and
# when it was published, then its text. The time lets the AI tell a trial's
# second day from its first.
def story_line(post):
	data = json.decode(post.get("data", "") or "{}", None)
	rss = data.get("rss", {}) if type(data) == "dict" else {}
	source = rss.get("source", "") if type(rss) == "dict" else ""
	parts = [source] if source else []
	parts.append("credibility " + str(post.get("credibility", 100)))
	if post.get("published"):
		parts.append("published " + post["published"] + " UTC")
	return "[" + ", ".join(parts) + "] " + post_prompt(post, 500)

# The story prompt for a new post and the best post of each candidate story.
def story_prompt(post, candidates):
	lines = [str(i) + ". " + story_line(c["post"]) for i, c in enumerate(candidates)]
	return AI_PROMPT_STORY.replace("{{post}}", story_line(post)).replace("{{posts}}", "\n".join(lines))

# Read the AI's story decision: the index of the candidate the new post joins,
# or None, and whether the new post is the better account. Anything malformed
# reads as no match, so the post starts a story of its own, and so does a match
# that names no event: the AI has to say what the two posts both report.
def story_parse(text, count):
	none = {"story": None, "better": False}
	text = (text or "").strip()
	start = text.find("{")
	end = text.rfind("}")
	if start < 0 or end < start:
		return none
	answer = json.decode(text[start:end + 1], None)
	if type(answer) != "dict":
		return none
	index = answer.get("story")
	if type(index) == "float" and index == int(index):
		index = int(index)
	if type(index) != "int" or index < 0 or index >= count:
		return none
	event = answer.get("event")
	if type(event) != "string" or not event.strip():
		return none
	return {"story": index, "better": answer.get("better") == True}

# What a decision does: the story the new post belongs to, and the novelty each
# affected post should have. A better account takes over from the story's best
# post, unless the reader has seen the story already.
def story_outcome(post_id, candidates, answer):
	index = answer["story"]
	if index == None:
		return {"story": post_id, "novelty": [{"post": post_id, "novelty": 100}]}
	candidate = candidates[index]
	if answer["better"] and not candidate["seen"]:
		return {"story": candidate["story"], "novelty": [{"post": post_id, "novelty": 100}, {"post": candidate["post"]["id"], "novelty": STORY_DUPLICATE}]}
	return {"story": candidate["story"], "novelty": [{"post": post_id, "novelty": STORY_DUPLICATE}]}

# The recent stories a post might belong to: those with a post sharing one of
# its tags, most shared tags first. Each comes with its best post, and whether
# the reader has seen any of its posts.
def story_candidates(feed_id, post_id, labels):
	placeholders = ", ".join(["?" for _ in labels])
	parameters = [feed_id, post_id, mochi.time.now() - STORY_WINDOW] + labels + [STORY_CANDIDATES]
	rows = mochi.db.rows("select m.story as story, count(*) as shared, max(m.created) as latest from posts m join tags t on t.object=m.id where m.feed=? and m.id!=? and m.story!='' and m.created>? and t.label in (" + placeholders + ") group by m.story order by shared desc, latest desc limit ?", *parameters) or []
	candidates = []
	for row in rows:
		best = mochi.db.row("select id, body, data, credibility, strftime('%Y-%m-%d %H:%M', created, 'unixepoch') as published from posts where feed=? and story=? order by novelty desc, created desc limit 1", feed_id, row["story"])
		if not best:
			continue
		seen = mochi.db.exists("select 1 from posts where feed=? and story=? and read>0", feed_id, row["story"])
		candidates.append({"story": row["story"], "post": best, "seen": seen})
	return candidates

# Place one post in a story and return the novelty changes it made. A post
# already placed is left alone, so a post edited and re-tagged keeps its story.
def story_place(feed_id, post_id, account):
	post = mochi.db.row("select id, body, data, credibility, story, strftime('%Y-%m-%d %H:%M', created, 'unixepoch') as published from posts where id=? and feed=?", post_id, feed_id)
	if not post or post["story"]:
		return []
	labels = [t["label"] for t in mochi.db.rows("select label from tags where object=?", post_id) or []]
	candidates = story_candidates(feed_id, post_id, labels) if labels else []
	answer = {"story": None, "better": False}
	if candidates and account:
		result = mochi.ai.prompt(story_prompt(post, candidates), account=account, tokens=STORY_TOKENS)
		if result["status"] == 200:
			answer = story_parse(result.get("text", ""), len(candidates))
		else:
			mochi.log.debug("story_place: AI call failed post=" + post_id + " status=" + str(result["status"]))
	outcome = story_outcome(post_id, candidates, answer)
	mochi.db.execute("update posts set story=? where id=?", outcome["story"], post_id)
	changes = []
	for item in outcome["novelty"]:
		if mochi.db.exists("select 1 from posts where id=? and novelty!=?", item["post"], item["novelty"]):
			mochi.db.execute("update posts set novelty=? where id=?", item["novelty"], item["post"])
			changes.append(item)
	return changes

# Place a feed's queued posts in their stories, one at a time. Two posts about
# the same story tagged at the same moment would each miss the other if placed
# in parallel, so only the holder of the feed's lock places posts; a pass that
# finds the lock held leaves its post queued for the holder.
def story_drain(feed_id):
	feed_data = mochi.db.row("select ai_mode, ai_account from feeds where id=?", feed_id)
	if not feed_data or feed_data["ai_mode"] != "tag+deduplicate":
		mochi.db.execute("delete from placements where feed=?", feed_id)
		return
	now = mochi.time.now()
	name = "story/" + feed_id
	token = mochi.uid()
	mochi.db.execute("delete from locks where expires <= ?", now)
	mochi.db.execute("insert into locks (name, token, expires) values (?, ?, ?) on conflict do nothing", name, token, now + 400)
	lock = mochi.db.row("select token from locks where name=?", name)
	if not lock or lock["token"] != token:
		return

	account = resolve_ai_account(feed_data.get("ai_account", 0))
	deadline = now + STORY_BUDGET
	changes = []
	finished = True
	for row in mochi.db.rows("select post from placements where feed=? order by queued, post", feed_id) or []:
		if mochi.time.now() >= deadline:
			finished = False
			break
		# Dequeued before placing, so a post whose placement fails is not
		# retried by every later pass.
		mochi.db.execute("delete from placements where post=?", row["post"])
		changes.extend(story_place(feed_id, row["post"], account))

	if changes:
		broadcast_event(feed_id, "post/novelty/batch", {"items": changes})
	mochi.db.execute("delete from locks where name=? and token=?", name, token)

	# Posts queued while this pass held the lock, and any the budget did not
	# reach, are still waiting.
	if mochi.db.exists("select 1 from placements where feed=?", feed_id):
		mochi.schedule.after("schedule_story", {"feed": feed_id}, 0 if finished else 5)

# Scheduled event handler for story placement
def schedule_story(e):
	if e.source != "schedule":
		return
	feed_id = e.data.get("feed", "")
	if feed_id:
		story_drain(feed_id)

# Set AI mode and account for a feed
def action_ai_settings(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id
	feed_id = a.input("feed")
	mode = a.input("mode", "")
	account = a.input("account", "")
	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		a.error.label(404, "errors.feed_not_found")
		return
	is_owner = is_feed_owner(user_id, feed_data)
	is_subscriber = is_user_subscribed(user_id, feed_data["id"])
	if not is_owner and not is_subscriber:
		a.error.label(403, "errors.not_allowed")
		return
	if is_owner:
		if mode not in ("", "tag", "tag+deduplicate"):
			a.error.label(400, "errors.invalid_ai_mode")
			return
	if account and account != "0":
		accounts = mochi.account.list("ai")
		found = False
		for acc in accounts:
			if acc["id"] == account:
				found = True
				break
		if not found:
			a.error.label(400, "errors.ai_account_not_found")
			return
	if is_owner:
		mochi.db.execute("update feeds set ai_mode=?, ai_account=? where id=?", mode, account, feed_data["id"])
	else:
		# Subscribers can only set their own AI account
		mochi.db.execute("update feeds set ai_account=? where id=?", account, feed_data["id"])
	return {"data": {"ok": True}}

# Get custom AI prompts for a feed
def action_ai_prompts_get(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id
	feed_id = a.input("feed")
	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		a.error.label(404, "errors.feed_not_found")
		return
	if not is_feed_owner(user_id, feed_data) and not is_user_subscribed(user_id, feed_data["id"]):
		a.error.label(403, "errors.not_allowed")
		return
	prompts = {}
	if feed_data.get("ai_prompt_new", ""):
		prompts["new"] = feed_data["ai_prompt_new"]
	if feed_data.get("ai_prompt_rank", ""):
		prompts["rank"] = feed_data["ai_prompt_rank"]
	# Also get user-level credibility prompt
	cred_prompt = a.user.preference.get("ai_prompt_credibility")
	if cred_prompt:
		prompts["credibility"] = cred_prompt
	return {"data": {"prompts": prompts, "defaults": AI_PROMPT_DEFAULTS}}

# Set custom AI prompts for a feed
def action_ai_prompts_set(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id
	feed_id = a.input("feed")
	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		a.error.label(404, "errors.feed_not_found")
		return
	is_owner = is_feed_owner(user_id, feed_data)
	is_subscriber = is_user_subscribed(user_id, feed_data["id"])
	if not is_owner and not is_subscriber:
		a.error.label(403, "errors.not_allowed")
		return
	prompt_type = a.input("type")
	prompt_text = a.input("prompt", "")
	if prompt_type not in ("new", "rank", "credibility"):
		a.error.label(400, "errors.invalid_prompt_type")
		return
	if not is_owner and prompt_type != "rank":
		a.error.label(403, "errors.subscribers_rank_only")
		return
	if prompt_type == "credibility":
		# Credibility prompt is per-user
		if prompt_text:
			a.user.preference.set("ai_prompt_credibility", prompt_text)
		else:
			a.user.preference.set("ai_prompt_credibility", "")
	else:
		# Entity prompts are per-feed, one column each
		col = "ai_prompt_" + prompt_type
		mochi.db.execute("update feeds set " + col + "=? where id=?", prompt_text, feed_data["id"])
	return {"data": {"ok": True}}

# List tags for a post
def action_tags_list(a):
	post_id = a.input("post")
	if not post_id:
		a.error.label(400, "errors.missing_post")
		return
	feed = get_feed(a)
	if not feed:
		a.error.label(404, "errors.feed_not_found")
		return
	# View access, for feeds we own AND for replicas. Not the privacy column:
	# action_subscribe never writes it, so it reads 'public' on every replica.
	if not check_access(a, feed["id"], "view"):
		a.error.label(403, "errors.access_denied")
		return
	# Bind the post to the route feed - never list tags for another feed's post.
	if not mochi.db.exists("select 1 from posts where id=? and feed=?", post_id, feed["id"]):
		a.error.label(404, "errors.post_not_found")
		return
	tags = mochi.db.rows("select id, label, qid, source, relevance from tags where object=?", post_id) or []
	# Enrich with the caller's own interests only; an anonymous caller runs as the
	# owner, so enriching then would leak the owner's interest weights.
	if a.user:
		tags = enrich_tags(tags, get_interest_map())
	return {"data": {"tags": tags}}

# Add a tag to a post
def action_tags_add(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id
	feed_id = a.input("feed")
	post_id = a.input("post")
	label = a.input("label")

	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		a.error.label(404, "errors.feed_not_found")
		return

	post = mochi.db.row("select * from posts where id=? and feed=?", post_id, feed_data["id"])
	if not post:
		a.error.label(404, "errors.post_not_found")
		return

	if not can_tag_post(user_id):
		a.error.label(403, "errors.not_allowed_tag_posts")
		return

	label = validate_tag(label)
	if not label:
		a.error.label(400, "errors.invalid_tag")
		return

	# If we own the feed, handle locally
	if owned(feed_data["id"]):
		# Deduplicate
		existing = mochi.db.row("select id, label from tags where object=? and label=?", post_id, label)
		if existing:
			return {"data": existing}

		tag_id = mochi.uid()

		# Resolve QID for the tag label
		results = mochi.qid.search(label, "en")
		if not results:
			a.error.label(400, "errors.could_not_resolve_tag")
			return
		qid = results[0]["qid"]

		# Deduplicate by QID — another tag on this post may already cover the same entity
		existing_qid = mochi.db.row("select id, label, qid, source from tags where object=? and qid=?", post_id, qid)
		if existing_qid:
			return {"data": existing_qid}

		mochi.db.execute("insert into tags (id, object, label, qid) values (?, ?, ?, ?)", tag_id, post_id, label, qid)

		# Broadcast to subscribers
		broadcast_event(feed_data["id"], "tag/add", {"id": tag_id, "object": post_id, "label": label, "qid": qid, "source": "manual"})
		broadcast_websocket(feed_data["id"], {"type": "tag/add", "feed": feed_data["id"], "post": post_id, "tag": {"id": tag_id, "label": label, "qid": qid, "source": "manual"}, "sender": user_id})

		# Update user interests from manual tag
		mochi.interests.adjust(qid, 10)

		return {"data": {"id": tag_id, "label": label, "qid": qid, "source": "manual"}}

	# Not owner — store locally and forward to feed owner via P2P
	tag_id = mochi.uid()

	results = mochi.qid.search(label, "en")
	if not results:
		a.error.label(400, "errors.could_not_resolve_tag")
		return
	qid = results[0]["qid"]

	# Deduplicate locally
	existing = mochi.db.row("select id, label from tags where object=? and label=?", post_id, label)
	if existing:
		return {"data": existing}

	# Deduplicate by QID — another tag on this post may already cover the same entity
	existing_qid = mochi.db.row("select id, label, qid, source from tags where object=? and qid=?", post_id, qid)
	if existing_qid:
		return {"data": existing_qid}

	mochi.db.execute("insert into tags (id, object, label, qid, source) values (?, ?, ?, ?, ?)", tag_id, post_id, label, qid, "manual")

	mochi.message.send(
		{"from": user_id, "to": feed_data["id"], "service": "feeds", "event": "tag/add/submit"},
		{"post": post_id, "label": label}
	)

	mochi.interests.adjust(qid, 10)

	return {"data": {"id": tag_id, "label": label, "qid": qid, "source": "manual"}}

# Remove a tag from a post
def action_tags_remove(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id
	feed_id = a.input("feed")
	post_id = a.input("post")
	tag_id = a.input("tag")

	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		a.error.label(404, "errors.feed_not_found")
		return

	post = mochi.db.row("select * from posts where id=? and feed=?", post_id, feed_data["id"])
	if not post:
		a.error.label(404, "errors.post_not_found")
		return

	if not can_tag_post(user_id):
		a.error.label(403, "errors.not_allowed_remove_tags")
		return

	# If we own the feed, handle locally
	if owned(feed_data["id"]):
		mochi.db.execute("delete from tags where id=? and object=?", tag_id, post_id)

		# Broadcast to subscribers
		broadcast_event(feed_data["id"], "tag/remove", {"id": tag_id, "object": post_id})
		broadcast_websocket(feed_data["id"], {"type": "tag/remove", "feed": feed_data["id"], "post": post_id, "tag": tag_id, "sender": user_id})

		return {"data": {"ok": True}}

	# Not owner — forward to feed owner via P2P.
	# Include the label so the owner can find the tag even if the local ID
	# differs from the owner's canonical ID (subscriber generates a temporary
	# ID that hasn't been reconciled yet when delete happens quickly).
	tag_row = mochi.db.row("select label from tags where id=? and object=?", tag_id, post_id)
	label = tag_row["label"] if tag_row else ""
	mochi.message.send(
		{"from": user_id, "to": feed_data["id"], "service": "feeds", "event": "tag/remove/submit"},
		{"post": post_id, "tag": tag_id, "label": label}
	)

	# Delete locally too
	mochi.db.execute("delete from tags where id=? and object=?", tag_id, post_id)

	return {"data": {"ok": True}}

# List all tags used in a feed with counts
def action_feed_tags(a):
	feed_id = a.input("feed")
	if not feed_id:
		a.error.label(400, "errors.missing_feed")
		return

	user_id = a.user.identity.id if a.user else None
	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		a.error.label(404, "errors.feed_not_found")
		return

	# Same view gate as action_view, for owned feeds and replicas. Never gate on
	# the privacy column: action_subscribe never writes it, so every replica reads
	# 'public'.
	if not check_access(a, feed_data["id"], "view"):
		a.error.label(403, "errors.access_denied")
		return

	tags = mochi.db.rows("select label, count(*) as count from tags where object in (select id from posts where feed=?) group by label order by count desc", feed_data["id"]) or []
	return {"data": {"tags": tags}}

# Update user interests based on a reaction to a post
def update_interests_from_reaction(post_id, positive):
	tags = mochi.db.rows("select qid from tags where object=? and source='ai' and qid != ''", post_id)
	if not tags:
		return
	qids = [t["qid"] for t in tags]
	delta = 5 if positive else -10
	mochi.interests.adjust(qids, delta)

# Adjust interest weight for a specific tag QID or label
def action_tag_interest(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	qid = a.input("qid")
	label = a.input("label")
	direction = a.input("direction")
	# Resolve QID from label if not provided
	if not qid and label:
		results = mochi.qid.search(label, "en")
		if results and len(results) > 0:
			top = results[0]
			if top["label"].lower() == label.lower():
				qid = top["qid"]
	if not qid:
		a.error.label(400, "errors.could_not_resolve_tag")
		return
	if direction == "up":
		mochi.interests.adjust(qid, 15)
	elif direction == "down":
		mochi.interests.adjust(qid, -20)
	elif direction == "remove":
		mochi.interests.remove(qid)
	else:
		a.error.label(400, "errors.invalid_direction")
		return
	return {"data": {"ok": True}}


# Batch-compute and store interest scores for multiple posts.
# Loads interests once, batch-loads tags, stores results in post_scores.
def score_posts_for_viewer(post_ids, viewer_id):
	if not post_ids:
		return

	interests = mochi.interests.top(100)
	if not interests:
		return
	interest_map = {}
	for i in interests:
		interest_map[i["qid"]] = i["weight"]

	negative_interests = mochi.interests.bottom(100)
	negative_map = {}
	for i in negative_interests:
		negative_map[i["qid"]] = i["weight"]

	# Batch-load AI tags
	placeholders = ", ".join(["?" for _ in post_ids])
	all_tags = mochi.db.rows(
		"select object, qid, relevance from tags where object in (" + placeholders + ") and source='ai' and qid != ''",
		*post_ids
	) or []
	post_tags = {}
	for t in all_tags:
		pid = t["object"]
		if pid not in post_tags:
			post_tags[pid] = []
		post_tags[pid].append(t)

	# Batch-load credibility
	cred_rows = mochi.db.rows(
		"select id, credibility from posts where id in (" + placeholders + ")",
		*post_ids
	) or []
	cred_map = {}
	for r in cred_rows:
		cred_map[r["id"]] = r.get("credibility", 100)

	now_ts = mochi.time.now()
	for pid in post_ids:
		credibility = cred_map.get(pid, 100)
		tags = post_tags.get(pid, [])
		total_score = 0
		worst_penalty = 0
		for t in tags:
			qid = t["qid"]
			relevance = t["relevance"] if t["relevance"] else 0.5
			weight = interest_map.get(qid, 0)
			if weight > 0:
				total_score += credibility * weight * relevance
			neg_weight = negative_map.get(qid, 0)
			if neg_weight < 0:
				penalty = neg_weight * relevance / 10000
				if penalty < worst_penalty:
					worst_penalty = penalty

		if total_score > 0:
			score = total_score * max(0, 1 + worst_penalty)
		elif worst_penalty < 0:
			score = worst_penalty * credibility
		else:
			score = 0
		mochi.db.execute(
			"insert or replace into post_scores (post, viewer, score, computed) values (?, ?, ?, ?)",
			pid, viewer_id, score, now_ts
		)


# Compute match info for displayed posts (which interests matched).
# Lightweight — called only for the final page of posts at view time.
def compute_match_info(posts):
	interests = mochi.interests.top(100)
	if not interests:
		return []
	for p in posts:
		if "effective_score" in p:
			p["_score"] = p["effective_score"]

	return interests


# AI re-ranking: re-score the top candidates with the LLM.
def ai_rerank(feed_data, posts):
	if not posts:
		return posts
	account = resolve_ai_account(feed_data.get("ai_account", 0))
	if not account:
		return posts

	# Only re-rank top 50 candidates
	candidates = posts[:50]
	rest = posts[50:]

	# Check cache — use cached scores if all candidates have been scored before
	placeholders = ", ".join(["?" for _ in candidates])
	cache_rows = mochi.db.rows(
		"select post, score, computed from score_cache where feed=? and post in (" + placeholders + ")",
		feed_data["id"], *[p["id"] for p in candidates]
	) or []
	cached = {}
	for row in cache_rows:
		cached[row["post"]] = row["score"]

	# Apply cached scores where available
	for p in candidates:
		if p["id"] in cached:
			p["_score"] = cached[p["id"]]

	if len(cached) < len(candidates):
		# Some posts have never been scored — schedule background AI rerank
		mochi.schedule.after("schedule_ai_rerank", {"feed": feed_data["id"]}, 0)

	candidates = sorted(candidates, key=lambda p: (-p.get("_score", 0), -p["created"]))
	return candidates + rest

# Background AI rerank — scores posts and updates the cache without blocking page load
def ai_rerank_batch(feed_id):
	feed_data = mochi.db.row("select * from feeds where id=?", feed_id)
	if not feed_data:
		return
	account = resolve_ai_account(feed_data.get("ai_account", 0))
	if not account:
		return

	# Get recent posts to score
	posts = mochi.db.rows("select * from posts where feed=? order by created desc limit 50", feed_id)
	if not posts:
		return

	# Load tags for scoring
	post_ids = [p["id"] for p in posts]
	placeholders = ", ".join(["?" for _ in post_ids])
	all_tags = mochi.db.rows(
		"select object, label, qid, relevance from tags where object in (" + placeholders + ") and source='ai' and qid != ''",
		*post_ids
	) or []
	post_tags = {}
	for t in all_tags:
		pid = t["object"]
		if pid not in post_tags:
			post_tags[pid] = []
		post_tags[pid].append(t)

	# Build interest summary
	interests = mochi.interests.top(100)
	summary = mochi.interests.summary()
	if not summary:
		interest_labels = [i["qid"] for i in interests] if interests else []
		summary = ", ".join(interest_labels[:15])

	# Build post summaries for the prompt
	post_lines = []
	for i, p in enumerate(posts):
		tags = post_tags.get(p["id"], [])
		tag_labels = [t["label"] for t in tags if t.get("label")]
		tag_str = ", ".join(tag_labels[:5]) if tag_labels else "none"
		cred = p.get("credibility", 100)
		post_lines.append(str(i) + ". [" + tag_str + "] (credibility: " + str(cred) + ") " + post_prompt(p, 200))

	prompt = get_ai_prompt(feed_id, "rank").replace("{{interests}}", summary).replace("{{posts}}", "\n".join(post_lines))

	result = mochi.ai.prompt(prompt, account=account)
	if result["status"] != 200:
		return

	# Parse scores
	text = result["text"].strip()
	if text.startswith("```"):
		lines = text.split("\n")
		text = "\n".join(lines[1:-1])
	scores = json.decode(text, None)
	if type(scores) != "list" or not scores:
		return

	# Apply scores and update cache
	now_ts = mochi.time.now()
	for s in scores:
		if type(s) != "dict":
			continue
		idx = s.get("index", -1)
		sc = s.get("score", 0)
		if type(idx) == "int" and idx >= 0 and idx < len(posts):
			mochi.db.execute("insert or replace into score_cache (feed, post, score, computed) values (?, ?, ?, ?)",
				feed_id, posts[idx]["id"], sc, now_ts)

# ---- Saved posts ---- Per-user rows in this app's own database. Each stores a
# JSON snapshot of the post so the saved list renders from one local query
# without fanning out to feeds that may be offline.

# List the current user's saved posts, most recently saved first.
def action_saved_list(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	rows = mochi.db.rows("select data, created from saved where user=? order by created desc", a.user.identity.id)
	posts = []
	for r in rows:
		item = json.decode(r["data"], None)
		if item:
			# "created" is the saved-at time; the post snapshot is nested under
			# "post" so its own "created" (post time) is preserved.
			posts.append({"post": item, "created": r["created"]})
	return {"data": {"saved": posts, "total": len(posts)}}

# Save a post (idempotent). "post" is the post's id; "data" is a JSON snapshot
# of the post object to render later. Re-saving an already-saved post refreshes
# the stored snapshot without changing its saved-at time.
def action_saved_add(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	post = a.input("post")
	if not post:
		a.error.label(400, "errors.post_id_required")
		return
	data = a.input("data")
	if not data or json.decode(data, None) == None:
		a.error.label(400, "errors.invalid_data")
		return
	saved_set(a.user.identity.id, post, data)
	return {"data": {"saved": True}}

# saved_set saves a post for the user with the data its saved view shows,
# or changes that data where it is saved.
def saved_set(user, post, data):
	existing = mochi.db.row("select id from saved where user=? and post=?", user, post)
	if existing:
		mochi.db.execute("update saved set data=? where id=?", data, existing["id"])
	else:
		mochi.db.execute("insert or ignore into saved ( id, user, post, data, created ) values ( ?, ?, ?, ?, ? )", mochi.uid(), user, post, data, mochi.time.now())

# Remove a saved post. Idempotent: removing a post that is not saved is a no-op.
def action_saved_remove(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	post = a.input("post")
	if not post:
		a.error.label(400, "errors.post_id_required")
		return
	mochi.db.execute("delete from saved where user=? and post=?", a.user.identity.id, post)
	return {"data": {"saved": False}}

# Remove all of the current user's saved posts.
def action_saved_clear(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	mochi.db.execute("delete from saved where user=?", a.user.identity.id)
	return {"data": {"saved": True}}


# Create database
# database_upgrade: post-squash migration ladder (baseline is schema 1).
def database_upgrade(version):
	if version == 2:
		# Per-feed AI prompt columns, missing on databases created before they were in
		# database_create.
		columns = [c["name"] for c in mochi.db.table("feeds")]
		for column in ["ai_prompt_new", "ai_prompt_batch", "ai_prompt_rank"]:
			if column not in columns:
				mochi.db.execute("alter table feeds add column " + column + " text not null default ''")
	if version == 3:
		# Rebuild posts/comments/reactions whose foreign keys still name the renamed
		# table "feed"; gated on the stale schema text. The _new tables reference
		# posts_new so the final rename rewrites them to posts; drop children before
		# the parent.
		row = mochi.db.row("select sql from sqlite_master where type='table' and name='posts'")
		if row and "referencesfeed(" in row["sql"].replace(" ", "").replace('"', ""):
			mochi.db.execute("create table posts_new ( id text not null primary key, feed references feeds( id ), body text not null, data text not null default '', format text not null default 'markdown', created integer not null, updated integer not null, edited integer not null default 0, up integer not null default 0, down integer not null default 0, mmdd text not null default '', author text not null default '', read integer not null default 0, novelty integer not null default 100, credibility integer not null default 100 )")
			mochi.db.execute("insert into posts_new ( id, feed, body, data, format, created, updated, edited, up, down, mmdd, author, read, novelty, credibility ) select id, feed, body, data, format, created, updated, edited, up, down, mmdd, author, read, novelty, credibility from posts")
			mochi.db.execute("create table comments_new ( id text not null primary key, feed references feeds( id ), post references posts_new( id ), parent text not null, subscriber text not null, name text not null, body text not null, format text not null default 'text', created integer not null, edited integer not null default 0 )")
			mochi.db.execute("insert into comments_new ( id, feed, post, parent, subscriber, name, body, format, created, edited ) select id, feed, post, parent, subscriber, name, body, format, created, edited from comments")
			mochi.db.execute("create table reactions_new ( feed references feeds( id ), post references posts_new( id ), comment text not null default '', subscriber text not null, name text not null, reaction text not null default '', primary key ( feed, post, comment, subscriber ) )")
			mochi.db.execute("insert into reactions_new ( feed, post, comment, subscriber, name, reaction ) select feed, post, comment, subscriber, name, reaction from reactions")
			mochi.db.execute("drop table reactions")
			mochi.db.execute("drop table comments")
			mochi.db.execute("drop table posts")
			mochi.db.execute("alter table posts_new rename to posts")
			mochi.db.execute("alter table comments_new rename to comments")
			mochi.db.execute("alter table reactions_new rename to reactions")
			mochi.db.execute("create index if not exists posts_feed on posts( feed )")
			mochi.db.execute("create index if not exists posts_created on posts( created )")
			mochi.db.execute("create index if not exists posts_updated on posts( updated )")
			mochi.db.execute("create index if not exists posts_mmdd on posts( feed, mmdd )")
			mochi.db.execute("create index if not exists comments_feed on comments( feed )")
			mochi.db.execute("create index if not exists comments_post on comments( post )")
			mochi.db.execute("create index if not exists comments_parent on comments( parent )")
			mochi.db.execute("create index if not exists comments_created on comments( created )")
			mochi.db.execute("create index if not exists reactions_post on reactions( post )")
			mochi.db.execute("create index if not exists reactions_comment on reactions( comment )")
		# Drop the broadcast tables left behind when broadcast state moved to the
		# per-app system DB; inert, but stale copies mislead diagnosis.
		for table in ["sequence", "log", "acknowledged", "received"]:
			mochi.db.execute("drop table if exists " + table)
	if version == 4 or version == 5 or version == 6:
		# Attachments move from core's store into this database (shared library). Both
		# calls are idempotent, so the step is safe under any of these numbers.
		attachment_schema_create()
		attachment_migrate()

	if version == 7:
		# A comment may be anchored to one of its post's attachments: the
		# discussion stays one thread, but a remark about a particular photo
		# can say which. Empty for an ordinary comment. Idempotent via the
		# column list, since a failed step re-runs under the next number.
		if not any([c["name"] == "attachment" for c in mochi.db.table("comments")]):
			mochi.db.execute("alter table comments add column attachment text not null default ''")

	if version == 8:
		# The posts this user follows, and their per-feed notification switches.
		mochi.db.execute("create table if not exists follows ( feed text not null, post text not null, primary key ( feed, post ) )")
		mochi.db.execute("create table if not exists notifications ( feed text not null, kind text not null, enabled integer not null, primary key ( feed, kind ) )")

	if version == 9:
		# Posts are grouped into stories. Every existing post becomes a story of
		# its own, and the novelty the old comparison pass gave posts is cleared:
		# it compared only posts that arrived together.
		if not any([c["name"] == "story" for c in mochi.db.table("posts")]):
			mochi.db.execute("alter table posts add column story text not null default ''")
		mochi.db.execute("update posts set story=id where story=''")
		mochi.db.execute("update posts set novelty=100 where novelty!=100")
		mochi.db.execute("create index if not exists posts_story on posts( feed, story )")

	if version == 10:
		# Accounts on other networks: the publish lists, the copies and the
		# record of their ids, the accounts' job cursors, and the moment an
		# account source polls from.
		publish_schema_create()

	if version == 11:
		# The same tables again: a database whose step to 10 ran while the
		# functions were not yet loaded was left at 10 without them.
		publish_schema_create()
		mochi.db.execute("create table if not exists placements ( post text not null primary key, feed text not null, queued integer not null )")
		mochi.db.execute("create index if not exists placements_feed on placements( feed, queued )")
		mochi.db.execute("create table if not exists locks ( name text not null primary key, token text not null, expires integer not null default 0 )")
		# The comparison pass's prompt went with it.
		if any([c["name"] == "ai_prompt_batch" for c in mochi.db.table("feeds")]):
			mochi.db.execute("alter table feeds drop column ai_prompt_batch")
	if version == 12:
		# A hosted account's address and page on the publish list (phase 15).
		publish_schema_create()
	if version == 13:
		# A fediverse address is written @name@domain; the list kept the
		# name@domain of the account's earlier identifier.
		mochi.db.execute("update publish set address='@'||address where address!='' and address not like '@%'")
	if version == 14:
		# Fediverse interactions (phase 16): a comment from another network
		# keeps its id there, its author's page and the account it came
		# through; a post counts its boosts; a comment published as a reply
		# keeps its copies.
		columns = [c["name"] for c in mochi.db.table("comments")]
		for column in ["remote", "page", "account"]:
			if column not in columns:
				mochi.db.execute("alter table comments add column " + column + " text not null default ''")
		if "boosts" not in [c["name"] for c in mochi.db.table("posts")]:
			mochi.db.execute("alter table posts add column boosts integer not null default 0")
		replies_schema_create()
	if version == 15:
		# Following on the fediverse (phase 17): a post carries its
		# visibility, content warning, sensitive flag, pin, language and,
		# for a post from another network, its id there, with its author's
		# id in the author column; a source goes through a hosted account;
		# polls, keyword filters and a follows import keep tables.
		features_schema_create()
	if version == 16:
		# Following and interacting on Bluesky (phase 19): the likes a hosted
		# account made of posts from Bluesky, and the feeds published as
		# Bluesky custom feeds.
		bluesky_schema_create()

def bluesky_schema_create():
	"""The tables of phase 19, made at creation and by the migration alike:
	the like record a hosted Bluesky account made of a post from Bluesky, and
	the generator record a feed is published as from an account."""
	mochi.db.execute("create table if not exists likes ( post text not null, account text not null, remote text not null, created integer not null, primary key ( post, account ) )")
	mochi.db.execute("create table if not exists generators ( feed text not null, account text not null, uri text not null, created integer not null, primary key ( feed, account ) )")

def features_schema_create():
	"""The columns and tables of phase 17, made at creation and by the
	migration alike."""
	columns = [c["name"] for c in mochi.db.table("posts")]
	for column, definition in [("visibility", "text not null default 'public'"), ("warning", "text not null default ''"), ("sensitive", "integer not null default 0"), ("pinned", "integer not null default 0"), ("language", "text not null default ''"), ("remote", "text not null default ''")]:
		if column not in columns:
			mochi.db.execute("alter table posts add column " + column + " " + definition)
	mochi.db.execute("create index if not exists posts_remote on posts( remote )")
	if "account" not in [c["name"] for c in mochi.db.table("sources")]:
		mochi.db.execute("alter table sources add column account text not null default ''")
	mochi.db.execute("create table if not exists votes ( post text not null, option integer not null, voter text not null, created integer not null, primary key ( post, option, voter ) )")
	mochi.db.execute("create table if not exists filters ( id text not null primary key, feed text not null, phrase text not null, created integer not null )")
	mochi.db.execute("create index if not exists filters_feed on filters( feed )")
	mochi.db.execute("create table if not exists imports ( id text not null primary key, feed text not null, account text not null default '', addresses text not null, position integer not null default 0, created integer not null )")

def database_create():
	mochi.db.execute("create table if not exists feeds ( id text not null primary key, name text not null, privacy text not null default 'public', subscribers integer not null default 0, updated integer not null, server text not null default '', fingerprint text not null default '', read integer not null default 0, banner text not null default '', ai_mode text not null default '', ai_account integer not null default 0, ai_prompt_new text not null default '', ai_prompt_rank text not null default '', sort text not null default '', synced integer not null default 0, populated integer not null default 1 )")
	mochi.db.execute("create index if not exists feeds_name on feeds( name )")
	mochi.db.execute("create index if not exists feeds_updated on feeds( updated )")
	mochi.db.execute("create index if not exists feeds_fingerprint on feeds( fingerprint )")

	mochi.db.execute("create table if not exists subscribers ( feed references feeds( id ), id text not null, name text not null default '', primary key ( feed, id ) )")
	mochi.db.execute("create index if not exists subscriber_id on subscribers( id )")

	mochi.db.execute("create table if not exists posts ( id text not null primary key, feed references feeds( id ), body text not null, data text not null default '', format text not null default 'markdown', created integer not null, updated integer not null, edited integer not null default 0, up integer not null default 0, down integer not null default 0, boosts integer not null default 0, mmdd text not null default '', author text not null default '', read integer not null default 0, novelty integer not null default 100, credibility integer not null default 100, story text not null default '' )")
	mochi.db.execute("create index if not exists posts_feed on posts( feed )")
	mochi.db.execute("create index if not exists posts_created on posts( created )")
	mochi.db.execute("create index if not exists posts_updated on posts( updated )")
	mochi.db.execute("create index if not exists posts_mmdd on posts( feed, mmdd )")
	mochi.db.execute("create index if not exists posts_story on posts( feed, story )")

	# Posts waiting to be placed in a story, and the per-feed lock that lets one
	# pass place them at a time.
	mochi.db.execute("create table if not exists placements ( post text not null primary key, feed text not null, queued integer not null )")
	mochi.db.execute("create index if not exists placements_feed on placements( feed, queued )")
	mochi.db.execute("create table if not exists locks ( name text not null primary key, token text not null, expires integer not null default 0 )")

	mochi.db.execute("create table if not exists comments ( id text not null primary key, feed references feeds( id ), post references posts( id ), parent text not null, subscriber text not null, name text not null, body text not null, format text not null default 'text', created integer not null, edited integer not null default 0, attachment text not null default '', remote text not null default '', page text not null default '', account text not null default '' )")
	mochi.db.execute("create index if not exists comments_feed on comments( feed )")
	mochi.db.execute("create index if not exists comments_post on comments( post )")
	mochi.db.execute("create index if not exists comments_parent on comments( parent )")
	mochi.db.execute("create index if not exists comments_created on comments( created )")

	mochi.db.execute("create table if not exists reactions ( feed references feeds( id ), post references posts( id ), comment text not null default '', subscriber text not null, name text not null, reaction text not null default '', primary key ( feed, post, comment, subscriber ) )")
	mochi.db.execute("create index if not exists reactions_post on reactions( post )")
	mochi.db.execute("create index if not exists reactions_comment on reactions( comment )")

	# The posts this user follows: every reply and reaction in them notifies. A
	# post is followed on writing it or commenting on it, and by choice.
	mochi.db.execute("create table if not exists follows ( feed text not null, post text not null, primary key ( feed, post ) )")

	# This user's notification switches per feed, where they differ from
	# NOTIFICATION_DEFAULTS.
	mochi.db.execute("create table if not exists notifications ( feed text not null, kind text not null, enabled integer not null, primary key ( feed, kind ) )")

	mochi.db.execute("create table if not exists rss ( token text not null primary key, entity text not null, mode text not null, created integer not null, unique(entity, mode) )")
	mochi.db.execute("create index if not exists rss_entity on rss( entity )")

	mochi.db.execute("create table if not exists sources ( id text not null primary key, feed references feeds( id ), type text not null, url text not null, name text not null default '', credibility integer not null default 100, base integer not null default 300, max integer not null default 86400, interval integer not null default 300, next integer not null default 0, jitter integer not null default 60, changed integer not null default 0, etag text not null default '', modified text not null default '', ttl integer not null default 0, fetched integer not null default 0, transform text not null default '' )")
	mochi.db.execute("create index if not exists sources_feed on sources( feed )")
	mochi.db.execute("create index if not exists sources_next on sources( next )")
	mochi.db.execute("create index if not exists sources_type on sources( type )")

	mochi.db.execute("create table if not exists source_posts ( source text not null references sources( id ), post text not null, guid text not null default '', primary key ( source, post ) )")
	mochi.db.execute("create unique index if not exists source_posts_source_guid on source_posts( source, guid )")
	mochi.db.execute("create index if not exists source_posts_post on source_posts( post )")

	mochi.db.execute("create table if not exists tags ( id text not null primary key, object text not null, label text not null, qid text not null default '', relevance real not null default 0.0, source text not null default 'manual' )")
	mochi.db.execute("create index if not exists tags_object on tags( object )")
	mochi.db.execute("create index if not exists tags_label on tags( label )")
	mochi.db.execute("create index if not exists tags_qid on tags( qid )")
	mochi.db.execute("create unique index if not exists tags_object_label on tags( object, label )")

	mochi.db.execute("create table if not exists post_scores ( post text not null, viewer text not null, score real not null default 0, computed integer not null default 0, primary key ( post, viewer ) )")
	mochi.db.execute("create index if not exists post_scores_viewer on post_scores( viewer )")

	mochi.db.execute("create table if not exists score_cache ( feed text not null, post text not null, score real not null default 0, computed integer not null default 0, primary key ( feed, post ) )")

	mochi.db.execute("create table if not exists poll_locks ( feed text not null primary key, token text not null, expires integer not null default 0 )")

	mochi.db.execute("create table if not exists settings ( id integer primary key check ( id = 1 ), sort text not null default '' )")
	mochi.db.execute("insert or ignore into settings ( id, sort ) values ( 1, '' )")

	mochi.db.execute("create table if not exists saved ( id text not null primary key, user text not null, post text not null, data text not null default '', created integer not null, unique ( user, post ) )")
	publish_schema_create()
	features_schema_create()
	bluesky_schema_create()
	mochi.db.execute("create index if not exists saved_user_created on saved( user, created )")

	# Attachments now live in this database, owned by the shared library.
	attachment_schema_create()


def compute_mmdd(timestamp):
	row = mochi.db.row("select strftime('%m%d', ?, 'unixepoch') as mmdd", timestamp)
	return row["mmdd"] if row else ""

# Milestone years for memories: 1, 2, then multiples of 5
MILESTONE_YEARS = [1, 2, 5, 10, 15, 20, 25, 30]

# Pick the best year for a memory from years that have posts on today's date
def pick_memory_year(years_with_posts, current_year):
	best = None
	best_milestone = -1
	for year in years_with_posts:
		diff = current_year - year
		if diff <= 0:
			continue
		# Check if this is a milestone year
		milestone = -1
		for m in MILESTONE_YEARS:
			if diff == m:
				milestone = m
				break
		if milestone > best_milestone:
			best_milestone = milestone
			best = year
		elif milestone == best_milestone and (best == None or year > best):
			# Same milestone tier — prefer more recent year
			best = year
	return best

# Pick the best post from candidates for a memory
def pick_memory_post(posts, feed_id):
	if not posts:
		return None
	best = posts[0]
	best_has_att = len(attachment_list(best["id"], feed_id)) > 0
	for i in range(1, len(posts)):
		p = posts[i]
		p_has_att = len(attachment_list(p["id"], feed_id)) > 0
		# Prefer posts with attachments
		if p_has_att and not best_has_att:
			best = p
			best_has_att = True
			continue
		if best_has_att and not p_has_att:
			continue
		# Tie-break by highest reaction score
		p_score = p.get("up", 0) - p.get("down", 0)
		best_score = best.get("up", 0) - best.get("down", 0)
		if p_score > best_score:
			best = p
			best_has_att = p_has_att
			continue
		if p_score < best_score:
			continue
		# Final tie-break: first post of the day (lowest created)
		if p["created"] < best["created"]:
			best = p
			best_has_att = p_has_att
	return best

# Check and generate a memory post for a feed
def check_memories(feed_id, source_id):
	now = mochi.time.now()
	today_mmdd = compute_mmdd(now)
	if not today_mmdd:
		return

	# Get the current year
	year_row = mochi.db.row("select cast(strftime('%Y', ?, 'unixepoch') as integer) as y", now)
	current_year = year_row["y"] if year_row else 0
	if current_year == 0:
		return

	# Find candidate posts: same mmdd, in this feed, not from a source, not from today
	today_start_row = mochi.db.row("select cast(strftime('%s', date(?, 'unixepoch')) as integer) as ts", now)
	today_start = today_start_row["ts"] if today_start_row else now

	candidates = mochi.db.rows("""
		select p.* from posts p
		where p.feed=? and p.mmdd=? and p.created < ?
		and not exists (select 1 from source_posts sp where sp.post=p.id)
		order by p.created
	""", feed_id, today_mmdd, today_start)

	if not candidates:
		return

	# Group by year
	years = {}
	for p in candidates:
		y_row = mochi.db.row("select cast(strftime('%Y', ?, 'unixepoch') as integer) as y", p["created"])
		y = y_row["y"] if y_row else 0
		if y > 0 and y != current_year:
			if y not in years:
				years[y] = []
			years[y].append(p)

	if not years:
		return

	# Pick the best year
	best_year = pick_memory_year(list(years.keys()), current_year)
	if not best_year:
		return

	# Pick the best post from that year
	post = pick_memory_post(years[best_year], feed_id)
	if not post:
		return

	# Dedup check: one memory per original post per calendar year
	dedup_guid = "memory:" + post["id"] + ":" + str(current_year)
	if mochi.db.exists("select 1 from source_posts where source=? and guid=?", source_id, dedup_guid):
		return

	# Create the memory post
	years_ago = current_year - best_year
	data = json.encode({"memory": {"year": best_year, "years_ago": years_ago}})

	memory_id = mochi.uid()
	mochi.db.execute("insert into posts (id, feed, body, data, format, created, updated, mmdd) values (?, ?, ?, ?, 'markdown', ?, ?, ?)",
		memory_id, feed_id, post["body"], data, now, now, today_mmdd)
	mochi.db.execute("insert into source_posts (source, post, guid) values (?, ?, ?) on conflict do nothing",
		source_id, memory_id, dedup_guid)
	winner = mochi.db.row("select post from source_posts where source=? and guid=?", source_id, dedup_guid)
	if not winner or winner["post"] != memory_id:
		mochi.log.debug("check_memories: lost race on (source, guid); cleaning up orphan post source=" + source_id + " guid=" + dedup_guid)
		mochi.db.execute("delete from posts where id=?", memory_id)
		mochi.db.execute("delete from follows where post=?", memory_id)
		return

	# Update source fetched timestamp
	mochi.db.execute("update sources set fetched=? where id=?", now, source_id)

	set_feed_updated(feed_id)
	broadcast_websocket(feed_id, {"type": "post/create", "feed": feed_id, "post": memory_id})

# ACTIONS

# Info endpoint for class context - returns list of feeds
# The tile source every map in the app renders. An operator sets it through
# the map tile system settings; the OpenStreetMap default needs no key.
def map_tiles():
    return {
        "url": mochi.setting.get("map_tile_url"),
        "attribution": mochi.setting.get("map_tile_attribution"),
    }

def action_info_class(a):
    user_id = a.user.identity.id if a.user else None

    if user_id:
        # Return feeds the user owns or is subscribed to
        # Strategy: Start with subscribed feeds (from subscribers table), then add owned feeds

        feeds = get_user_feeds(user_id)
        # Every app open re-establishes the user's RSS polls and watchdog, so
        # schedule rows lost to a scheduler cutover come back without a visit
        # to each feed.
        ensure_polls()
    else:
        feeds = []

    has_ai = resolve_ai_account(0) != "" if user_id else False
    settings = mochi.db.row("select sort from settings where id=1") or {"sort": ""}

    return {"data": {"entity": False, "feeds": feeds, "user_id": user_id, "hasAi": has_ai, "settings": settings, "tiles": map_tiles()}}

# Info endpoint for entity context - returns feed info with permissions
def action_info_entity(a):
    feed = get_feed(a)
    if not feed:
        a.error.label(404, "errors.feed_not_found")
        return

    user_id = a.user.identity.id if a.user else None
    feed_entity_id = feed.get("id")

    if not check_access(a, feed["id"], "view"):
        a.error.label(403, "errors.access_denied")
        return

    # a.owner: core answers for the routed entity against the AUTHENTICATED
    # caller. owned() resolved through mochi.entity.get, and an anonymous request
    # to a public action runs as the entity owner - so a stranger reading this
    # public route was told they owned it.
    is_owner = a.owner
    # Project before adding anything: the row came from `select *`, so it still
    # carries the owner's AI prompts, AI account, read watermark and server.
    feed = feed_visible(feed, is_owner)
    feed["fingerprint"] = mochi.entity.fingerprint(feed_entity_id)
    feed["owner"] = 1 if is_owner else 0
    if not is_owner:
        feed["isSubscribed"] = is_user_subscribed(user_id, feed_entity_id) if user_id else False

    # Re-establish this feed's poll and the daily watchdog. The schedule rows
    # can be lost (a scheduler cutover, a purge), and the owner's visit is the
    # earliest moment to notice; the watchdog alone would wait a day.
    if is_owner and user_id:
        ensure_feed_poll(feed_entity_id)
        ensure_sources_watchdog()


    # Check memories source — generate a memory post if not yet checked today
    if is_owner and user_id:
        mem_source = mochi.db.row("select * from sources where feed=? and type='feed/memories'", feed_entity_id)
        if mem_source:
            now = mochi.time.now()
            today_row = mochi.db.row("select date(?, 'unixepoch') as d", now)
            fetched_row = mochi.db.row("select date(?, 'unixepoch') as d", mem_source["fetched"]) if mem_source["fetched"] > 0 else None
            if not fetched_row or today_row["d"] != fetched_row["d"]:
                check_memories(feed_entity_id, mem_source["id"])

    # Determine permissions for current user
    can_manage = check_access(a, feed_entity_id, "manage") if a.user else False
    permissions = {
        "view": True,
        "react": can_manage or check_access(a, feed_entity_id, "react") or check_access(a, feed_entity_id, "comment"),
        "comment": can_manage or check_access(a, feed_entity_id, "comment"),
        "manage": can_manage,
    } if a.user else {"view": True, "react": False, "comment": False, "manage": False}

    # Render banner markdown to HTML
    banner = feed.get("banner", "")
    if banner:
        feed["banner_html"] = mochi.text.markdown(banner)

    raw = mochi.entity.fingerprint(feed_entity_id)
    fp = raw[:3] + "-" + raw[3:6] + "-" + raw[6:]

    # The hosted accounts the feed publishes to, for the follow control a
    # visitor from another network uses (phase 15): public, as the feed is.
    if feed.get("privacy", "public") == "public":
        feed["accounts"] = follow_accounts(feed_entity_id)

    return {"data": {
        "entity": True,
        "feed": feed,
        "permissions": permissions,
        "fingerprint": fp,
        "user_id": user_id,
        "tiles": map_tiles()
    }}

# Attachment routes are public so anonymous viewers can load a public feed's
# files. attachment_serve does no access check, so serve_attachment is the gate:
# view access on a.user, and the attachment bound to a post or comment in this
# feed.
def action_attachment(a):
	serve_attachment(a, "")

def action_attachment_thumbnail(a):
	serve_attachment(a, "thumbnail")

def action_attachment_preview(a):
	serve_attachment(a, "preview")

def serve_attachment(a, variant):
	feed_id = a.input("feed")
	attachment = a.input("id")

	# The :feed route param may be an entity id or a 9-char fingerprint, so
	# match either (as feed_by_id does). feed_row is None for feeds we don't
	# hold locally. Compare against the canonical id, not the raw param.
	feed_row = mochi.db.row("select * from feeds where id=? or fingerprint=?", feed_id, feed_id)
	if not feed_row:
		# A feed we don't hold: the viewer browsed it through its owner
		# (view_remote), so its attachments come from the owner the same way,
		# and the owner's event_attachment_fetch decides the viewer's access.
		if mochi.text.valid(feed_id, "fingerprint"):
			feed_id = resolve_feed_id(feed_id)
		if not mochi.text.valid(feed_id, "entity"):
			a.error.label(404, "errors.attachment_not_found")
			return
		attachment_relay(a, feed_id, attachment, variant=variant)
		return
	feed = feed_row.get("id")

	# Same view gate as action_view, for owned feeds and replicas. Never gate on
	# the privacy column (subscribe never writes it) and never defer to the owning
	# server - once bytes are cached locally core serves them from disk without
	# consulting it.
	if not check_access(a, feed, "view"):
		a.error.label(403, "errors.feed_is_private")
		return

	# The library serves the bytes with no access check of its own, so this gate
	# and the binding both run. Bind the attachment to a post or a comment in
	# THIS feed, so one feed's attachment can't be fetched through another feed's
	# route. Access was already checked above; the serve callback passes.
	def bound(obj):
		if mochi.db.exists("select 1 from posts where id=? and feed=?", obj, feed):
			return True
		if mochi.db.exists("select 1 from comments where id=? and feed=?", obj, feed):
			return True
		# A post copied in from a feed/posts source keeps its attachments under
		# the SOURCE post's id, which attachment_list falls back to. Reaching one
		# through this feed is legitimate, so accept an object this feed's own
		# source_posts names - still scoped to this feed, so one feed's
		# attachment is no more fetchable through another's route than before.
		return mochi.db.exists(
			"select 1 from source_posts sp join posts p on p.id=sp.post where sp.guid=? and p.feed=?",
			obj, feed)
	# Only the real, authenticated owner adopts legacy remote-provenance rows on
	# first serve. An anonymous request to this public route runs as the entity
	# owner, so mochi.entity.get(feed) is truthy for it too - gate on a.user so a
	# commenter's upload is not pulled in as the owner's (#313). Replicas cache.
	attachment_serve(a, attachment, feed, variant=variant, member=bound,
		adopt=bool(a.user and mochi.entity.get(feed)))

def action_view(a):
	feed_id = a.input("feed")
	user_id = a.user.identity.id if a.user else None
	server = a.input("server")

	# Get local feed data if available
	feed_data = None
	if type(feed_id) == type("") and (mochi.text.valid(feed_id, "entity") or mochi.text.valid(feed_id, "fingerprint")):
		feed_data = feed_by_id(user_id, feed_id)

	# Determine if we need to fetch remotely
	# Remote only for feeds we don't have locally (not subscribed and not owned)
	is_remote = False
	if feed_id and not feed_data:
		is_remote = True

	# For remote feeds, fetch via P2P
	if is_remote and feed_id:
		return view_remote(a, user_id, feed_id, server)

	# Local feed handling
	if user_id == None and feed_data == None:
		a.error.label(404, "errors.no_feed_specified")
		return

	# Check access to specific feed
	if feed_data:
		if not check_access(a, feed_data["id"], "view"):
			a.error.label(403, "errors.feed_is_private")
			return
		# Re-establish with the owner if this subscription has gone idle.
		maybe_resubscribe(a, feed_data["id"])

	post_id = a.input("post")

	# Pagination parameters
	limit_str = a.input("limit")
	before_str = a.input("before")
	offset_str = a.input("offset")
	sort = a.input("sort") or "new"
	tags = a.inputs("tag")
	unread = a.input("unread") == "1"
	limit = 20
	if limit_str and mochi.text.valid(limit_str, "natural"):
		limit = min(int(limit_str), 100)
	before = None
	if before_str and decimal(before_str):
		before = int(before_str)
	offset = 0
	if offset_str and decimal(offset_str):
		offset = int(offset_str)

	# Get posts order
	order_by = get_post_order(sort)
	relevance_sort = sort in ("relevant", "ai", "interests") and user_id

	# Build unread filter snippets
	unread_filter = ""
	unread_filter_p = ""
	if unread:
		unread_filter = " and read = 0 and created > coalesce((select f2.read from feeds f2 where f2.id=feed), 0)"
		unread_filter_p = " and p.read = 0 and p.created > coalesce((select read from feeds f2 where f2.id = p.feed), 0)"

	# What the viewer may see (phase 17): a followers-only post for the owner
	# and the subscribers, and nothing a keyword filter of theirs hides. The
	# listing across every subscribed feed is a subscriber's by construction.
	subscribed = bool(feed_data) and (is_feed_owner(user_id, feed_data) or bool(user_id and is_user_subscribed(user_id, feed_data["id"])))
	hidden_filter = (visibility_sql("", user_id, subscribed) if feed_data else "") + filters_sql("", "feed")
	hidden_filter_p = (visibility_sql("p.", user_id, subscribed) if feed_data else "") + filters_sql("p.", "p.feed")

	# SQL expression for effective relevance score (pre-computed interest score × novelty × time decay)
	now_ts = mochi.time.now()
	score_expr = "coalesce(ps.score, 0) * (p.novelty / 100.0) * (24.0 / ((" + str(now_ts) + " - p.created) / 3600.0 + 24.0))"

	if post_id:
		# Verify post belongs to an accessible feed
		post_feed = mochi.db.row("select feed, visibility from posts where id=?", post_id)
		if post_feed:
			pf_data = feed_by_id(user_id, post_feed["feed"])
			if not pf_data or not check_access(a, pf_data["id"], "view"):
				a.error.label(403, "errors.not_allowed_view_post")
				return
			if not post_visible(post_feed, user_id, is_feed_owner(user_id, pf_data) or bool(user_id and is_user_subscribed(user_id, pf_data["id"]))):
				a.error.label(403, "errors.not_allowed_view_post")
				return
		posts = mochi.db.rows("select * from posts where id=?", post_id)
	elif relevance_sort and feed_data and len(tags) > 0:
		# Relevance sort with tag filter
		valid_tags = []
		for t in tags:
			vt = validate_tag(t)
			if vt:
				valid_tags.append(vt)
		if len(valid_tags) == 0:
			posts = []
		else:
			placeholders = ", ".join(["?" for t in valid_tags])
			tag_filter = "(select count(*) from tags t where t.object = p.id and lower(t.label) in (" + placeholders + ")) = " + str(len(valid_tags))
			posts = mochi.db.rows(
				"select p.*, " + score_expr + " as effective_score from posts p left join post_scores ps on p.id = ps.post and ps.viewer = ? where p.feed = ? and " + tag_filter + unread_filter_p + hidden_filter_p + " order by effective_score desc, p.created desc limit ? offset ?",
				user_id, feed_data["id"], valid_tags, limit + 1, offset)
	elif relevance_sort and feed_data:
		# Relevance sort for a single feed
		posts = mochi.db.rows(
			"select p.*, " + score_expr + " as effective_score from posts p left join post_scores ps on p.id = ps.post and ps.viewer = ? where p.feed = ?" + unread_filter_p + hidden_filter_p + " order by effective_score desc, p.created desc limit ? offset ?",
			user_id, feed_data["id"], limit + 1, offset)
	elif relevance_sort and not feed_data:
		# Relevance sort across all subscribed feeds
		posts = mochi.db.rows(
			"select p.*, " + score_expr + " as effective_score from posts p inner join subscribers s on p.feed = s.feed left join post_scores ps on p.id = ps.post and ps.viewer = ? where s.id = ?" + unread_filter_p + hidden_filter_p + " order by effective_score desc, p.created desc limit ? offset ?",
			user_id, user_id, limit + 1, offset)
	elif feed_data and len(tags) > 0:
		# Tag filter without relevance sort
		valid_tags = []
		for t in tags:
			vt = validate_tag(t)
			if vt:
				valid_tags.append(vt)
		if len(valid_tags) == 0:
			posts = []
		else:
			p_order = order_by.replace("created", "p.created")
			placeholders = ", ".join(["?" for t in valid_tags])
			tag_filter = "(select count(*) from tags t where t.object = p.id and lower(t.label) in (" + placeholders + ")) = " + str(len(valid_tags))
			if before:
				posts = mochi.db.rows("select p.* from posts p where p.feed=? and " + tag_filter + unread_filter_p + hidden_filter_p + " and p.created<? order by " + p_order + " limit ?", feed_data["id"], valid_tags, before, limit + 1)
			else:
				posts = mochi.db.rows("select p.* from posts p where p.feed=? and " + tag_filter + unread_filter_p + hidden_filter_p + " order by " + p_order + " limit ?", feed_data["id"], valid_tags, limit + 1)
	elif feed_data:
		if before:
			posts = mochi.db.rows("select * from posts where feed=?" + unread_filter + hidden_filter + " and created<? order by " + order_by + " limit ?", feed_data["id"], before, limit + 1)
		else:
			posts = mochi.db.rows("select * from posts where feed=?" + unread_filter + hidden_filter + " order by " + order_by + " limit ?", feed_data["id"], limit + 1)
	else:
		# All subscribed feeds without relevance sort
		if len(tags) > 0:
			valid_tags = []
			for t in tags:
				vt = validate_tag(t)
				if vt:
					valid_tags.append(vt)
			if len(valid_tags) == 0:
				posts = []
			else:
				p_order = order_by.replace("created", "p.created")
				placeholders = ", ".join(["?" for t in valid_tags])
				tag_filter = "(select count(*) from tags t where t.object = p.id and lower(t.label) in (" + placeholders + ")) = " + str(len(valid_tags))
				if before:
					posts = mochi.db.rows("select p.* from posts p inner join subscribers s on p.feed = s.feed where s.id = ? and " + tag_filter + unread_filter_p + hidden_filter_p + " and p.created<? order by " + p_order + " limit ?", user_id, valid_tags, before, limit + 1)
				else:
					posts = mochi.db.rows("select p.* from posts p inner join subscribers s on p.feed = s.feed where s.id = ? and " + tag_filter + unread_filter_p + hidden_filter_p + " order by " + p_order + " limit ?", user_id, valid_tags, limit + 1)
		elif before:
			posts = mochi.db.rows("select p.* from posts p inner join subscribers s on p.feed = s.feed where s.id = ?" + unread_filter_p + hidden_filter_p + " and p.created<? order by " + order_by.replace("created", "p.created") + " limit ?", user_id, before, limit + 1)
		else:
			posts = mochi.db.rows("select p.* from posts p inner join subscribers s on p.feed = s.feed where s.id = ?" + unread_filter_p + hidden_filter_p + " order by " + order_by.replace("created", "p.created") + " limit ?", user_id, limit + 1)

	# Check if there are more posts
	has_more = len(posts) > limit
	if has_more:
		posts = posts[:limit]

	# Compute next cursor/offset
	next_cursor = None
	if has_more:
		if relevance_sort:
			next_cursor = offset + limit
		elif len(posts) > 0:
			next_cursor = posts[-1]["created"]

	# For relevance sorts, compute match info and apply AI rerank if needed.
	# Also check if pre-computed scores are stale (interests changed since last scoring).
	matches_info = []
	if relevance_sort:
		matches_info = compute_match_info(posts)
		if sort in ("ai", "relevant") and feed_data:
			posts = list(posts)
			posts = ai_rerank(feed_data, posts)

		# Staleness check: rescore displayed posts inline and schedule background refresh for the rest
		all_interests = mochi.interests.list()
		max_interest_updated = 0
		for i in all_interests:
			u = i.get("updated", 0)
			if u > max_interest_updated:
				max_interest_updated = u
		if max_interest_updated > 0:
			min_row = mochi.db.row("select min(computed) as mc from post_scores where viewer=?", user_id)
			mc = min_row["mc"] if min_row and min_row["mc"] else 0
			if max_interest_updated > mc:
				# Rescore displayed posts inline so this page reflects updated interests
				stale_ids = []
				for p in posts:
					ps_row = mochi.db.row("select computed from post_scores where post=? and viewer=?", p["id"], user_id)
					if not ps_row or ps_row["computed"] < max_interest_updated:
						stale_ids.append(p["id"])
				if stale_ids:
					score_posts_for_viewer(stale_ids, user_id)
					posts = list(posts)
					for p in posts:
						score_row = mochi.db.row("select score from post_scores where post=? and viewer=?", p["id"], user_id)
						s = score_row["score"] if score_row else 0
						novelty = p.get("novelty", 100) / 100.0
						age_hours = (now_ts - p["created"]) / 3600.0
						p["effective_score"] = s * novelty * (24.0 / (age_hours + 24.0))
					def score_sort_key(p):
						return (-p.get("effective_score", 0), -p.get("created", 0))
					posts = sorted(posts, key=score_sort_key)
				# Schedule background refresh for remaining stale scores
				mochi.schedule.after("schedule_scores_refresh", {"viewer": user_id}, 0)

	interest_map = get_interest_map() if user_id else {}

	# Four of the per-post lookups below were a query EACH, so a 50-post page
	# cost 200 round trips for data that four whole-page queries answer. The
	# lists are already bounded by the page limit, so the IN clauses are too.
	post_ids = [p["id"] for p in posts]
	placeholders = ", ".join(["?" for _ in post_ids])

	feed_names = {}
	if posts:
		feed_ids = {}
		for p in posts:
			feed_ids[p["feed"]] = True
		feed_places = ", ".join(["?" for _ in feed_ids])
		for row in mochi.db.rows("select id, name from feeds where id in (" + feed_places + ")", *feed_ids.keys()) or []:
			feed_names[row["id"]] = row["name"]

	tags_by_post = {}
	reactions_by_post = {}
	mine_by_post = {}
	sources_by_post = {}
	copies_by_post = copies_by_posts([p["id"] for p in posts])
	if post_ids:
		for row in mochi.db.rows("select object, id, label, qid, source, relevance from tags where object in (" + placeholders + ")", *post_ids) or []:
			tags_by_post.setdefault(row["object"], []).append(row)
		for row in mochi.db.rows("select * from reactions where comment='' and reaction!='' and post in (" + placeholders + ")", *post_ids) or []:
			if user_id and row["subscriber"] == user_id:
				mine_by_post[row["post"]] = row["reaction"]
			else:
				reactions_by_post.setdefault(row["post"], []).append(row)
		for row in mochi.db.rows("select sp.post, s.name, s.url, s.type from source_posts sp join sources s on sp.source = s.id where sp.post in (" + placeholders + ")", *post_ids) or []:
			sources_by_post[row["post"]] = row

	# Aggregate view ("All feeds") spans many feeds, so per-feed access is stamped
	# on each post below; the single-feed path emits one `permissions` object
	# instead. Without this the client had no per-feed signal and granted
	# react/comment on every subscribed feed, including one the owner has denied
	# (#152). Access is resolved once per distinct feed on the page.
	aggregate_permissions = {}
	if not feed_data:
		for p in posts:
			fid = p["feed"]
			if fid not in aggregate_permissions:
				can_manage = check_access(a, fid, "manage")
				aggregate_permissions[fid] = {
					"view": can_manage or check_access(a, fid, "view"),
					"react": can_manage or check_access(a, fid, "react"),
					"comment": can_manage or check_access(a, fid, "comment"),
					"manage": can_manage,
				}

	for i in range(len(posts)):
		if posts[i]["feed"] in feed_names:
			posts[i]["feed_fingerprint"] = mochi.entity.fingerprint(posts[i]["feed"])
			posts[i]["feed_name"] = feed_names[posts[i]["feed"]]

		if not feed_data:
			posts[i]["permissions"] = aggregate_permissions.get(posts[i]["feed"], {"view": True, "react": False, "comment": False, "manage": False})

		posts[i]["attachments"] = post_attachments(posts[i]["id"], posts[i]["feed"])

		# Parse extended data if present
		if posts[i].get("data"):
			posts[i]["data"] = json.decode(posts[i]["data"], None) or {}
		else:
			posts[i]["data"] = {}

		posts[i]["my_reaction"] = mine_by_post.get(posts[i]["id"], "") if user_id else ""
		posts[i]["reactions"] = reactions_by_post.get(posts[i]["id"], [])
		posts[i]["comments"] = feed_comments(user_id, posts[i], None, 0)

		# Add source attribution if post came from a source
		source_post = sources_by_post.get(posts[i]["id"])
		if source_post:
			posts[i]["source"] = {"name": source_post["name"], "url": source_post["url"], "type": source_post["type"]}
		elif posts[i]["data"].get("rss", {}).get("source"):
			rss = posts[i]["data"]["rss"]
			posts[i]["source"] = {"name": rss["source"], "url": rss.get("link", ""), "type": "rss"}
		posts[i]["copies"] = copies_by_post.get(posts[i]["id"], [])
		# The viewer's own vote in the post's poll (phase 17).
		if user_id and posts[i]["data"].get("poll"):
			posts[i]["voted"] = [row["option"] for row in mochi.db.rows("select option from votes where post=? and voter=? order by option", posts[i]["id"], user_id)]

		# Add tags
		posts[i]["tags"] = enrich_tags(tags_by_post.get(posts[i]["id"], []), interest_map)

		# Render markdown for markdown-format posts
		if posts[i].get("format", "markdown") == "markdown":
			posts[i]["body_markdown"] = mochi.text.markdown(posts[i]["body"])

		# For RSS posts with HTML content, use as rendered body
		rss = posts[i]["data"].get("rss")
		if rss and rss.get("html"):
			posts[i]["body_markdown"] = rss["html"]

	is_owner = is_feed_owner(user_id, feed_data)

	# Add isSubscribed and fingerprint fields
	if feed_data:
		feed_entity_id = feed_data.get("id")
		feed_data["fingerprint"] = mochi.entity.fingerprint(feed_entity_id)
		feed_data["owner"] = 1 if is_owner else 0
		if is_owner:
			feed_data["isSubscribed"] = False
		elif user_id and feed_entity_id:
			feed_data["isSubscribed"] = is_user_subscribed(user_id, feed_entity_id)
		else:
			feed_data["isSubscribed"] = False
		# Render banner markdown to HTML
		banner = feed_data.get("banner", "")
		if banner:
			feed_data["banner_html"] = mochi.text.markdown(banner)

	# Get feeds - filter to only feeds user owns or is subscribed to
	if user_id:
		feeds = get_user_feeds(user_id)
	else:
		feeds = []

	# Determine permissions for current user
	permissions = None
	if feed_data and user_id:
		feed_entity_id = feed_data.get("id")
		can_manage = check_access(a, feed_entity_id, "manage") or is_owner
		# The rules alone: a public feed's + grant admits everyone, a subscriber
		# is admitted by check_access, and a deny written for either is honoured
		# instead of being overridden here.
		can_react = can_manage or check_access(a, feed_entity_id, "react")
		can_comment = can_manage or check_access(a, feed_entity_id, "comment")
		
		permissions = {
			"view": True,
			"react": can_react,
			"comment": can_comment,
			"manage": can_manage,
		}
	
	# Check memories source — generate a memory post if not yet checked today
	if feed_data and is_owner and user_id:
		mem_source = mochi.db.row("select * from sources where feed=? and type='feed/memories'", feed_data["id"])
		if mem_source:
			now = mochi.time.now()
			# Compare dates: skip if already checked today
			today_row = mochi.db.row("select date(?, 'unixepoch') as d", now)
			fetched_row = mochi.db.row("select date(?, 'unixepoch') as d", mem_source["fetched"]) if mem_source["fetched"] > 0 else None
			if not fetched_row or today_row["d"] != fetched_row["d"]:
				check_memories(feed_data["id"], mem_source["id"])

	# Ensure poll schedule and watchdog exist when owner views their feed
	if feed_data and is_owner and user_id:
		ensure_feed_poll(feed_data["id"])
		ensure_sources_watchdog()

	# Ensure feed_data.name is populated - if empty, try to get it from feeds array
	if feed_data and feed_data.get("id"):
		feed_entity_id = feed_data.get("id")
		if not feed_data.get("name") or feed_data.get("name") == "":
			# Look for the feed in the feeds array
			for feed in feeds:
				if feed.get("id") == feed_entity_id and feed.get("name"):
					feed_data["name"] = feed.get("name")
					break
			# If still empty, try database lookup
			if not feed_data.get("name") or feed_data.get("name") == "":
				feed_with_name = mochi.db.row("select name from feeds where id=?", feed_entity_id)
				if feed_with_name and feed_with_name.get("name"):
					feed_data["name"] = feed_with_name.get("name")

	# Clean up internal scoring fields
	for p in posts:
		if "_score" in p:
			p["score"] = p.pop("_score")
		if "effective_score" in p:
			p.pop("effective_score")

	has_ai = resolve_ai_account(0) != "" if user_id else False

	# Project last: feed_data came from `select *` and the AI reranking and
	# polling above genuinely need the owner-only columns, but the response is
	# read by anyone who can view the feed.
	feed_public = feed_visible(feed_data, is_owner)
	if feed_public != None:
		for field in ["fingerprint", "owner", "isSubscribed", "banner_html"]:
			if field in feed_data:
				feed_public[field] = feed_data[field]

	# The single-post view says whether the signed-in reader follows the post;
	# an anonymous reader runs as the owner, whose follows are theirs alone.
	if post_id and user_id:
		for p in posts:
			p["following"] = followed(p.get("feed", ""), p["id"])

	result = {
		"data": {
			"feed": feed_public,
			"posts": posts,
			"feeds": feeds,
			"owner": is_owner,
			"user": user_id,
			"hasMore": has_more,
			"nextCursor": next_cursor,
			"permissions": permissions,
			"hasAi": has_ai,
		}
	}

	# Add hint if relevance sort was requested but no interests exist
	if sort in ("relevant", "ai", "interests") and not matches_info:
		result["data"]["relevantFallback"] = True

	return result

# Helper: Fetch posts from remote feed via P2P
# Helper: Fetch posts from remote feed via P2P
def view_remote(a, user_id, feed_id, server):
	if not user_id:
		a.error.label(401, "errors.not_logged_in")
		return

	# Resolve feed_id to entity ID if it's a fingerprint
	if mochi.text.valid(feed_id, "fingerprint"):
		resolved_id = resolve_feed_id(feed_id)
		if resolved_id and mochi.text.valid(resolved_id, "entity"):
			feed_id = resolved_id
	
	# Resolve server URL to peer, or use directory lookup if no server
	peer = None
	if server:
		peer = mochi.remote.peer(server)
		if not peer:
			a.error.label(502, "errors.unable_to_connect")
			return
			
	# Forward relevant query parameters to remote
	params = {"feed": feed_id}
	post_id = a.input("post")
	if post_id:
		params["post"] = post_id
	limit_str = a.input("limit")
	if limit_str:
		params["limit"] = limit_str
	before_str = a.input("before")
	if before_str:
		params["before"] = before_str
	sort = a.input("sort")
	if sort:
		params["sort"] = sort

	# If no peer, mochi.remote.request will use directory lookup
	response = mochi.remote.request(feed_id, "feeds", "view", params, peer)
	if response.get("error"):
		remote_error(a, response, 500)
		return

	# event_view answers with flat fields (name, fingerprint, privacy,
	# posts, ...). Tolerate a data/feed-wrapped shape for compatibility.
	remote_data = response.get("data", response)
	remote_feed = remote_data.get("feed", remote_data)

	feed_name = remote_feed.get("name", "")
	feed_fingerprint = remote_feed.get("fingerprint", mochi.entity.fingerprint(feed_id))
	feed_privacy = remote_feed.get("privacy", "public")
	remote_permissions = remote_data.get("permissions")
	posts = remote_data.get("posts", [])
	
	# Get feeds list for sidebar
	feeds = get_user_feeds(user_id) if user_id else []

	return {
		"data": {
			"feed": {
				"id": feed_id,
				"name": remote_feed.get("name", ""),
				"fingerprint": feed_fingerprint,
				"privacy": feed_privacy,
				"owner": 0,
				"subscribers": remote_feed.get("subscribers", 0),
				"isSubscribed": False,
				"banner": remote_data.get("banner", remote_feed.get("banner", "")),
				"banner_html": remote_data.get("banner_html", remote_feed.get("banner_html", "")),
			},
			"posts": posts,
			"feeds": feeds,
			"owner": False,
			"user": user_id,
			"hasMore": remote_data.get("hasMore", len(posts) > 20),
			"nextCursor": remote_data.get("nextCursor"),
			"permissions": remote_permissions
		}
	}

# Create a new feed
def action_create(a):
    if not a.user:
        a.error.label(401, "errors.not_logged_in")
        return

    name = a.input("name")
    if not name or not mochi.text.valid(name, "name"):
        a.error.label(400, "errors.invalid_name")
        return

    privacy = a.input("privacy") or "public"
    if privacy not in ["public", "private"]:
        a.error.label(400, "errors.invalid_privacy")
        return

    entity = feed_create(a.user.identity.id, a.user.identity.name, name, privacy, a.input("memories") != "false")
    if not entity:
        a.error.label(500, "errors.failed_create_feed")
        return

    return {"data": {"id": entity, "fingerprint": mochi.entity.fingerprint(entity)}}

def feed_create(creator, creator_name, name, privacy, memories):
    """Create a feed for the creator given: the entity, its row, the creator
    as its first subscriber, its access and, unless declined, the memories
    source. Answers the entity id, or None when no entity could be made."""
    entity = mochi.entity.create("feed", name, privacy, "")
    if not entity:
        return None

    now = mochi.time.now()

    fp = mochi.entity.fingerprint(entity) or ""
    mochi.db.execute("insert into feeds (id, name, privacy, subscribers, updated, fingerprint) values (?, ?, ?, 1, ?, ?)",
        entity, name, privacy, now, fp)

    mochi.db.execute("insert into subscribers (feed, id, name) values (?, ?, ?)",
        entity, creator, creator_name)

    # Set up access control
    resource = "feed/" + entity
    if privacy == "public":
        # Public feeds: anyone can view, authenticated users can comment
        mochi.access.allow("*", resource, "view", creator)
        mochi.access.allow("+", resource, "comment", creator)
    # Creator gets full access
    mochi.access.allow(creator, resource, "*", creator)

    if memories:
        mem_id = mochi.uid()
        mochi.db.execute("insert into sources (id, feed, type, url, name, base, max, interval, next, jitter, fetched) values (?, ?, 'feed/memories', '', ?, 0, 0, 0, 0, 0, 0)",
            mem_id, entity, mochi.app.label("source.memories.name"))

    return entity

# Service functions, for the login app's consent page (decision 42): the
# user's own feeds, and a feed made to be a hosted account's home feed. A
# service function runs as the calling user with no request, so the identity
# is read from the entities the user owns.

def service_identity():
    """The caller's person entity, or None."""
    for e in mochi.entity.owned():
        if e.get("class") == "person":
            return e
    return None

def function_list(context):
    """The caller's own feeds: id, name, privacy and fingerprint."""
    owned = owned_set()
    return [{"id": r["id"], "name": r["name"], "privacy": r["privacy"], "fingerprint": r["fingerprint"]}
        for r in mochi.db.rows("select id, name, privacy, fingerprint from feeds") if r["id"] in owned]

def function_create(context, name, privacy="public", account=""):
    """Make a feed for the caller, publishing to the account named alone, as
    a home feed made when an app signs in does (decision 42), or to nothing
    yet. Answers {id, name, fingerprint}, or None when it cannot."""
    if not name or not mochi.text.valid(name, "name") or privacy not in ["public", "private"]:
        return None
    identity = service_identity()
    if not identity:
        return None
    entity = feed_create(identity["id"], identity.get("name", ""), name, privacy, True)
    if not entity:
        return None
    if account and privacy == "public" and publish_account(account):
        publish_add(entity, account, mochi.time.now())
        ensure_account_jobs()
    return {"id": entity, "name": name, "fingerprint": mochi.entity.fingerprint(entity) or ""}

def action_search(a): # feeds_search
	if not a.user.identity.id:
		a.error.label(401, "errors.not_logged_in")
		return

	search = a.input("search")
	if not search:
		a.error.label(400, "errors.no_search_entered")
		return

	results = []

	# Check if search term is an entity ID (49-51 word characters)
	if mochi.text.valid(search, "entity"):
		entry = mochi.directory.get(search)
		if entry and entry.get("class") == "feed":
			results.append(entry)

	# Check if search term is a fingerprint (9 alphanumeric, with or without hyphens)
	fingerprint = search.replace("-", "")
	if mochi.text.valid(fingerprint, "fingerprint"):
		matches = mochi.directory.search("feed", "", False, fingerprint=fingerprint)
		for entry in matches:
			found = False
			for r in results:
				if r.get("id") == entry.get("id"):
					found = True
					break
			if not found:
				results.append(entry)

	# Check if search term is a URL (e.g., https://example.com/feeds/ENTITY_ID)
	if search.startswith("http://") or search.startswith("https://"):
		url = search
		if "/feeds/" in url:
			parts = url.split("/feeds/", 1)
			feed_path = parts[1]
			# Handle query parameter format: ?feed=ENTITY_ID
			if feed_path.startswith("?feed="):
				feed_id = feed_path[6:]
				if "&" in feed_id:
					feed_id = feed_id.split("&")[0]
				if "#" in feed_id:
					feed_id = feed_id.split("#")[0]
			else:
				# Path format: /feeds/ENTITY_ID or /feeds/ENTITY_ID/...
				feed_id = feed_path.split("/")[0] if "/" in feed_path else feed_path
				if "?" in feed_id:
					feed_id = feed_id.split("?")[0]
				if "#" in feed_id:
					feed_id = feed_id.split("#")[0]

			if mochi.text.valid(feed_id, "entity"):
				entry = mochi.directory.get(feed_id)
				if entry and entry.get("class") == "feed":
					# Avoid duplicates
					found = False
					for r in results:
						if r.get("id") == entry.get("id"):
							found = True
							break
					if not found:
						results.append(entry)
			# Try as fingerprint
			elif mochi.text.valid(feed_id, "fingerprint"):
				all_feeds = mochi.directory.search("feed", "", False, fingerprint=feed_id.replace("-", ""))
				for entry in all_feeds:
					entry_fp = entry.get("fingerprint", "").replace("-", "")
					if entry_fp == feed_id.replace("-", ""):
						found = False
						for r in results:
							if r.get("id") == entry.get("id"):
								found = True
								break
						if not found:
							results.append(entry)
						break

	# Also search by name
	name_results = mochi.directory.search("feed", search, False)
	for entry in name_results:
		# Avoid duplicates
		found = False
		for r in results:
			if r.get("id") == entry.get("id"):
				found = True
				break
		if not found:
			results.append(entry)

	return {"data": results}

# Read the user's BCP 47 language tag, or "en" if unset / anonymous
def user_language(a):
	if not a.user:
		return "en"
	preference = a.user.preference.get("language")
	if not preference:
		return "en"
	return str(preference).strip().lower()

# Get recommended feeds from the recommendations service
def action_recommendations(a):
	# Get user's existing feeds (owned or subscribed)
	existing_ids = set()
	feeds = mochi.db.rows("select id from feeds")
	for f in feeds:
		existing_ids.add(f["id"])
	subscribers = mochi.db.rows("select feed from subscribers")
	for s in subscribers:
		existing_ids.add(s["feed"])

	# Connect to recommendations service
	s = mochi.remote.stream("1JYmMpQU7fxvTrwHpNpiwKCgUg3odWqX7s9t1cLswSMAro5M2P", "recommendations", "list", {"type": "feed", "language": user_language(a)})
	if not s:
		return {"status": 500, "error": mochi.app.label("errors.recommendations_unavailable"), "data": {"feeds": []}}

	r = s.read()
	if r.get("status") != "200":
		return {"status": 500, "error": mochi.app.label("errors.recommendations_unavailable"), "data": {"feeds": []}}

	recommendations = []
	items = s.read()
	if type(items) not in ["list", "tuple"]:
		return {"data": {"feeds": []}}

	# Get the server location from the recommendations entity so subscribers can reach the feeds
	rec_dir = mochi.directory.get("1JYmMpQU7fxvTrwHpNpiwKCgUg3odWqX7s9t1cLswSMAro5M2P")
	rec_server = ""
	if rec_dir:
		rec_server = rec_dir.get("location", "")

	for item in items:
		entity_id = item.get("entity", "")
		if entity_id and entity_id not in existing_ids:
			recommendations.append({
				"id": entity_id,
				"name": item.get("name", ""),
				"blurb": item.get("blurb", ""),
				"fingerprint": mochi.entity.fingerprint(entity_id),
				"server": rec_server,
			})

	return {"data": {"feeds": recommendations}}

# Probe a remote feed by URL without subscribing
def action_probe(a):
	if not a.user.identity.id:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id

	url = a.input("url")
	if not url:
		a.error.label(400, "errors.no_url_provided")
		return

	# mochi://<peer>/<entity> - a share link pins the owner's peer directly,
	# so a private feed (never directory-listed) resolves without a hostname.
	if url.startswith("mochi://"):
		rest = url[len("mochi://"):]
		if "/" not in rest:
			a.error.label(400, "errors.invalid_url_format")
			return
		peer, path = rest.split("/", 1)
		feed_id = path.split("/")[0]
		if not peer or not mochi.text.valid(feed_id, "entity"):
			a.error.label(400, "errors.invalid_url_format")
			return
		response = mochi.remote.request(feed_id, "feeds", "info", {"feed": feed_id}, peer)
		if response.get("error"):
			remote_error(a, response, 404)
			return
		return {"data": {
			"id": feed_id,
			"name": response.get("name", ""),
			"fingerprint": response.get("fingerprint", ""),
			"class": "feed",
			"peer": peer,  # subscribe uses the same peer for its initial sync
			"remote": True
		}}

	# Parse URL to extract server and feed ID
	# Expected formats:
	#   https://example.com/feeds/ENTITY_ID
	#   http://example.com/feeds/ENTITY_ID
	#   example.com/feeds/ENTITY_ID
	server = ""
	feed_id = ""
	protocol = "https://"

	# Extract and preserve protocol prefix
	if url.startswith("https://"):
		protocol = "https://"
		url = url[8:]
	elif url.startswith("http://"):
		protocol = "http://"
		url = url[7:]

	# Split by /feeds/ to get server and feed ID
	if "/feeds/" in url:
		parts = url.split("/feeds/", 1)
		server = protocol + parts[0]
		# Feed ID is everything after /feeds/ up to next / or end
		feed_path = parts[1]
		if "/" in feed_path:
			feed_id = feed_path.split("/")[0]
		else:
			feed_id = feed_path
	else:
		a.error.label(400, "errors.invalid_url_format")
		return

	if not server or server == protocol:
		a.error.label(400, "errors.could_not_extract_server")
		return

	if not feed_id or (not mochi.text.valid(feed_id, "entity") and not mochi.text.valid(feed_id, "fingerprint")):
		a.error.label(400, "errors.could_not_extract_feed_id")
		return

	peer = mochi.remote.peer(server)
	if not peer:
		a.error.label(502, "errors.unable_to_connect")
		return
	response = mochi.remote.request(feed_id, "feeds", "info", {"feed": feed_id}, peer)
	if response.get("error"):
		remote_error(a, response, 404)
		return

	# Return feed info as a directory-like entry
	return {"data": {
		"id": feed_id,
		"name": response.get("name", ""),
		"fingerprint": response.get("fingerprint", ""),
		"class": "feed",
		"server": server,  # Keep server URL for future subscriptions
		"remote": True
	}}

# Get new feed data.
# Get new post data.
def action_post_new(a): # feeds_post_new
	if not a.user.identity.id:
		a.error.label(401, "errors.not_logged_in")
		return

	feeds = mochi.db.rows("select * from feeds")
	if len(feeds) == 0:
		a.error.label(500, "errors.no_owned_feeds")
		return
	
	owned_feeds = []
	for feed in feeds:
		if owned(feed["id"]):
			owned_feeds.append(feed_visible(feed, True))
	
	return {
		"data": {
			"feeds": owned_feeds,
			"current": a.input("current")
		}
	}

# New post
# Helper: Validate place data structure
def validate_place(place):
    if not place:
        return False
    if not place.get("name") or not mochi.text.valid(place.get("name", ""), "line"):
        return False
    if place.get("lat") == None or place.get("lon") == None:
        return False
    return True

# Helper: Validate post data (checkin, travelling, etc.)
# Keep only http(s) links. RSS <link> elements and remote post data are
# third-party/attacker-controlled; a javascript:/data: URL rendered as an
# <a href> executes on click (XSS). Returns the url when safe, else "".
def safe_link(url):
    if not url or type(url) != "string":
        return ""
    scheme = url.strip().lower()
    if scheme.startswith("http://") or scheme.startswith("https://"):
        return url
    return ""

# Return post data with any unsafe rss link scheme blanked. Copies rather than
# mutating in place, since event content dicts may be frozen.
def sanitize_post_data(data):
    if not data or type(data) != "dict":
        return data
    out = data
    rss = data.get("rss")
    if rss and type(rss) == "dict":
        link = rss.get("link", "")
        if link != safe_link(link):
            new_rss = dict(rss)
            new_rss["link"] = safe_link(link)
            out = dict(out)
            out["rss"] = new_rss
    if data.get("quote") != None:
        out = dict(out)
        clean = sanitize_quote(data["quote"])
        if clean:
            out["quote"] = clean
        else:
            out.pop("quote")
    # The fields of a post from another network, and a poll (phase 17): each
    # kept in its known shape only, links made safe, text cut.
    for key, clean in [("poll", sanitize_poll), ("media", sanitize_media), ("person", sanitize_person), ("boost", sanitize_person), ("emoji", sanitize_emoji), ("record", sanitize_record)]:
        if data.get(key) != None:
            out = dict(out)
            value = clean(data[key])
            if value:
                out[key] = value
            else:
                out.pop(key)
    return out

def sanitize_record(record):
    """The Bluesky record a post came from, {uri, cid}, as a reply, like or
    boost of it needs (phase 19); None where it is not one."""
    if type(record) != "dict":
        return None
    uri, cid = str(record.get("uri", "") or ""), str(record.get("cid", "") or "")
    if not uri.startswith("at://") or len(uri) > 1000 or not cid or len(cid) > 200 or not cid.isalnum():
        return None
    return {"uri": uri, "cid": cid}

def validate_post_data(data):
    if not data:
        return True
    # sanitize_post_data guards its type; this must too. Every caller takes the
    # value from a peer or a form, and .get on anything but a dict aborts the
    # handler rather than refusing the input.
    if type(data) != "dict":
        return False
    if data.get("quote") != None and type(data["quote"]) != "dict":
        return False
    if data.get("checkin") and not validate_place(data["checkin"]):
        return False
    if data.get("travelling"):
        travelling = data["travelling"]
        if not travelling.get("origin") or not validate_place(travelling["origin"]):
            return False
        if not travelling.get("destination") or not validate_place(travelling["destination"]):
            return False
    for key in ["poll", "person", "boost"]:
        if data.get(key) != None and type(data[key]) != "dict":
            return False
    for key in ["media", "emoji"]:
        if data.get(key) != None and not listlike(data[key]):
            return False
    if data.get("poll") != None and not sanitize_poll(data["poll"]):
        return False
    return True

# === Post features (the federation plan, phase 17) ===
#
# What Mastodon expects of a post and feeds lacked: per-post visibility, a
# content warning and the sensitive flag, a poll, a pin, the language, and
# for a post from another network its media, its author, who boosted it and
# the custom emoji its text names. The columns hold what is queried
# (visibility, warning, sensitive, pinned, language, remote); the rest rides
# in data. Each travels to Mochi subscribers as a field on the post events,
# which an older release ignores (decided 2026-10-07).

VISIBILITIES = ["public", "unlisted", "followers"]
WARNING_MAXIMUM = 500
POLL_OPTIONS_MINIMUM = 2
POLL_OPTIONS_MAXIMUM = 8
POLL_OPTION_MAXIMUM = 100
POLL_DURATION_MINIMUM = 300
POLL_DURATION_MAXIMUM = 7 * 86400
MEDIA_MAXIMUM = 8
EMOJI_MAXIMUM = 50

def valid_language(value):
    """A language tag as a post carries it: a two or three letter language,
    with a region or script after a hyphen at most."""
    if type(value) != "string" or not value or len(value) > 12:
        return False
    parts = value.split("-")
    if len(parts) > 2 or not parts[0].isalpha() or len(parts[0]) < 2 or len(parts[0]) > 3:
        return False
    return len(parts) == 1 or (parts[1].isalnum() and len(parts[1]) >= 2 and len(parts[1]) <= 4)

def sanitize_poll(poll):
    """A poll as it is kept: its options with their counts, whether several
    may be chosen, when it closes and how many have voted. None where it is
    not a poll."""
    if type(poll) != "dict" or not listlike(poll.get("options")):
        return None
    options = []
    for raw in poll["options"]:
        if type(raw) == "string":
            raw = {"name": raw}
        if type(raw) != "dict":
            return None
        name = str(raw.get("name", "") or "").strip()
        if not name or not mochi.text.valid(name, "line"):
            return None
        options.append({"name": text_cut(name, POLL_OPTION_MAXIMUM), "votes": max(number(raw.get("votes", 0)), 0)})
    if len(options) < POLL_OPTIONS_MINIMUM or len(options) > POLL_OPTIONS_MAXIMUM:
        return None
    return {"options": options, "multiple": bool(poll.get("multiple")), "expires": max(number(poll.get("expires", 0)), 0), "voters": max(number(poll.get("voters", 0)), 0)}

def sanitize_media(media):
    """The media of a post on another network, by their addresses there."""
    if not listlike(media):
        return None
    out = []
    for raw in list(media)[:MEDIA_MAXIMUM]:
        if type(raw) != "dict":
            continue
        url = safe_link(str(raw.get("url", "") or ""))
        if not url:
            continue
        kind = str(raw.get("type", "") or "")
        if kind not in ("image", "video", "audio", "file"):
            kind = "file"
        item = {"url": url, "type": kind}
        name = str(raw.get("name", "") or "")
        if name:
            item["name"] = text_cut(name, 1500)
        blurhash = str(raw.get("blurhash", "") or "")
        if blurhash and len(blurhash) <= 100:
            item["blurhash"] = blurhash
        for key in ["width", "height"]:
            if number(raw.get(key, 0)) > 0:
                item[key] = number(raw[key])
        out.append(item)
    return out or None

def sanitize_person(person):
    """A person on another network as a post names them: their id, name,
    address, page and avatar."""
    if type(person) != "dict":
        return None
    out = {}
    for key in ["id", "address"]:
        value = str(person.get(key, "") or "")
        if value and len(value) <= 2048:
            out[key] = value
    name = str(person.get("name", "") or "")
    if name:
        out["name"] = text_cut(name, 200)
    for key in ["page", "avatar"]:
        value = safe_link(str(person.get(key, "") or ""))
        if value:
            out[key] = value
    return out if out.get("id") or out.get("name") else None

def sanitize_emoji(emoji):
    """The custom emoji a post's text names, each a shortcode and its picture."""
    if not listlike(emoji):
        return None
    out = []
    for raw in list(emoji)[:EMOJI_MAXIMUM]:
        if type(raw) != "dict":
            continue
        name = str(raw.get("name", "") or "").strip(":")
        url = safe_link(str(raw.get("url", "") or ""))
        if not name or len(name) > 100 or not url or not mochi.text.valid(name, "line"):
            continue
        out.append({"name": name, "url": url})
    return out or None

def post_features_input(a):
    """The features a post form carries, each absent when the form says
    nothing. Answers (features, poll, ok): the columns to write, the poll for
    the post's data, and whether the form was valid."""
    features = {}
    visibility = a.input("visibility")
    if visibility != None:
        if visibility not in VISIBILITIES:
            return None, None, False
        features["visibility"] = visibility
    warning = a.input("warning")
    if warning != None:
        warning = warning.strip()
        if warning and (not mochi.text.valid(warning, "line") or len(warning) > WARNING_MAXIMUM):
            return None, None, False
        features["warning"] = warning
    sensitive = a.input("sensitive")
    if sensitive != None:
        features["sensitive"] = 1 if sensitive in ("1", "true", "on") else 0
    language = a.input("language")
    if language != None:
        if language and not valid_language(language):
            return None, None, False
        features["language"] = language.lower()
    poll = None
    raw = a.input("poll")
    if raw:
        decoded = json.decode(raw, None)
        poll = sanitize_poll(decoded) if type(decoded) == "dict" else None
        if not poll:
            return None, None, False
        duration = number(decoded.get("duration", 0))
        if duration:
            if duration < POLL_DURATION_MINIMUM or duration > POLL_DURATION_MAXIMUM:
                return None, None, False
            poll["expires"] = mochi.time.now() + duration
        for option in poll["options"]:
            option["votes"] = 0
        poll["voters"] = 0
    return features, poll, True

def post_features_event(e):
    """The features a post event carries, validated; None for an event that
    carries an invalid one."""
    features = {}
    visibility = e.content("visibility")
    if visibility != None:
        if visibility not in VISIBILITIES:
            return None
        features["visibility"] = visibility
    warning = e.content("warning")
    if warning != None:
        if type(warning) != "string" or (warning and (not mochi.text.valid(warning, "line") or len(warning) > WARNING_MAXIMUM)):
            return None
        features["warning"] = warning
    sensitive = e.content("sensitive")
    if sensitive != None:
        features["sensitive"] = 1 if sensitive else 0
    language = e.content("language")
    if language != None:
        if type(language) != "string" or (language and not valid_language(language)):
            return None
        features["language"] = language.lower()
    pinned = e.content("pinned")
    if pinned != None:
        features["pinned"] = max(number(pinned), 0)
    return features

def features_sql(features):
    """The set clause and arguments writing features to a posts row."""
    if not features:
        return "", []
    return ", ".join([key + "=?" for key in features]), [features[key] for key in features]

def post_features(post):
    """A post's features as the network form and the client read them."""
    data = post.get("data")
    if type(data) == "string":
        data = json.decode(data, None) if data else None
    data = data if type(data) == "dict" else {}
    return {
        "visibility": post.get("visibility") or "public",
        "warning": post.get("warning") or "",
        "sensitive": bool(post.get("sensitive")),
        "pinned": number(post.get("pinned", 0)),
        "language": post.get("language") or "",
        "poll": data.get("poll"),
    }

def post_event_features(post):
    """A post's features as a post event carries them."""
    features = post_features(post)
    return {"visibility": features["visibility"], "warning": features["warning"], "sensitive": features["sensitive"], "language": features["language"], "pinned": features["pinned"]}

def post_visible(post, viewer, subscribed):
    """Whether a viewer may see a post of a feed they may view: a public or
    unlisted post always; a followers-only post when they are the owner or a
    subscriber."""
    if (post.get("visibility") or "public") != "followers":
        return True
    return bool(viewer) and subscribed

def visibility_sql(prefix, viewer, subscribed):
    """The where clause keeping a listing to what the viewer may see."""
    if viewer and subscribed:
        return ""
    return " and " + prefix + "visibility!='followers'"

def filters_sql(prefix, feed_column):
    """The where clause hiding posts whose text names a phrase the viewer
    filters on the feed (keyword filters)."""
    return " and not exists (select 1 from filters f where f.feed=" + feed_column + " and instr(lower(" + prefix + "body), lower(f.phrase))>0)"

# post_create keeps a post the feed's owner writes, in markdown or plain
# text, with the attachments save(post) keeps for it, publishes it to the
# feed's accounts or those named, sends it to the subscribers and copies it
# into the feeds that take this one as a source. Answers (post id,
# attachments, None), or (None, None, failure).
def post_create(feed, user_id, user_name, body, data, features, accounts, save, format="markdown"):
	feed_id = feed["id"]
	post_uid = mochi.uid()
	if mochi.db.exists("select id from posts where id=?", post_uid):
		return None, None, (500, "errors.duplicate_id")

	now = mochi.time.now()
	data_value = json.encode(data) if data else ""
	mmdd = compute_mmdd(now)
	mochi.db.execute("insert into posts (id, feed, body, data, format, created, updated, mmdd, author, read) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		post_uid, feed_id, body, data_value, format, now, now, mmdd, user_id, now)
	if features:
		clause, values = features_sql(features)
		mochi.db.execute("update posts set " + clause + " where id=?", *(values + [post_uid]))
	mochi.db.commit.fire("posts", "insert", post_uid)
	set_feed_updated(feed_id)

	# Get subscribers for notification
	subscribers = mochi.db.rows("select id from subscribers where feed=? and id!=?", feed_id, user_id)

	# Save any uploaded attachments locally
	attachments = save(post_uid)

	# Copies on the accounts the feed publishes to, or those the writer chose
	# for this post; subscribers learn of them with the post (decision 31).
	post = mochi.db.row("select * from posts where id=?", post_uid)
	copies = publish_post(feed, post_uid, body, format, attachments, accounts, None, post)
	webmention_send(feed, post_uid, [body], post)

	# Send post to subscribers with attachment metadata piggybacked
	post_event = {"id": post_uid, "created": now, "body": body, "format": format}
	post_event.update(post_event_features(post))
	if data:
		post_event["data"] = data
	if attachments:
		post_event["attachments"] = [{"id": att["id"], "name": att["name"], "size": att["size"], "content_type": att.get("type", ""), "caption": att.get("caption", ""), "score": att.get("score", 0), "created": att.get("created", now)} for att in attachments]
	if copies:
		post_event["copies"] = copies
	broadcast_event(feed_id, "post/create", post_event, user_id)
	if body:
		notify_mentions(feed_id, post_uid, body, user_id, user_name)

	# post/create WebSocket notification is fired by the commit hook on the
	# insert above (see mochi.db.commit.fire / on_db_commit).

	# Copy post into any local aggregating feeds that use this feed as a source
	sources = mochi.db.rows("select id, feed from sources where type='feed/posts' and url=?", feed_id)
	for source in sources:
		copy_id = mochi.uid()
		mochi.db.execute("insert into posts (id, feed, body, data, format, created, updated, mmdd) values (?, ?, ?, ?, 'text', ?, ?, ?)",
			copy_id, source["feed"], body, data_value, now, now, mmdd)
		mochi.db.commit.fire("posts", "insert", copy_id)
		mochi.db.execute("insert or ignore into source_posts (source, post, guid) values (?, ?, ?)",
			source["id"], copy_id, post_uid)
		set_feed_updated(source["feed"])
		publish_sourced(source["feed"], copy_id, body, "text", {"remote": post_uid, "name": feed.get("name", ""), "link": post_link(feed_id, post_uid), "network": "mochi", "created": now})

	# Schedule AI tagging
	if feed.get("ai_mode", ""):
		mochi.schedule.after("schedule_ai_tag", {"feed": feed_id, "post": post_uid}, 0)

	follow(feed_id, post_uid)
	return post_uid, attachments, None

def action_post_create(a):
    if not a.user:
        a.error.label(401, "errors.not_logged_in")
        return
    user_id = a.user.identity.id

    feed = get_feed(a)
    if not feed:
        a.error.label(404, "errors.feed_not_found")
        return
    feed_id = feed["id"]

    if not is_feed_owner(user_id, feed):
        a.error.label(403, "errors.access_denied")
        return

    # Parse extended data (checkin, travelling, etc.)
    data_str = a.input("data")
    data = None
    if data_str:
        data = json.decode(data_str, None)
        if data == None or not validate_post_data(data):
            a.error.label(400, "errors.invalid_data")
            return
        data = sanitize_post_data(data)

    # Check if post has content beyond text (checkin, travelling, or attachments)
    has_checkin = data and data.get("checkin")
    has_travelling = data and data.get("travelling")
    has_files = len(a.files("files")) > 0

    body = a.input("body")
    if not mochi.text.valid(body, "text"):
        # Allow empty body if there's a check-in, travelling, or attachments
        if not has_checkin and not has_travelling and not has_files:
            a.error.label(400, "errors.invalid_body")
            return
        body = ""

    # Optional per-file captions: a JSON array of strings aligned with the
    # files' order, stored on the attachment rows and fanned out with them.
    captions = []
    captions_raw = a.input("captions")
    if captions_raw:
        decoded = json.decode(captions_raw, None)
        if type(decoded) != "list" or len(decoded) > 100:
            a.error.label(400, "errors.invalid_data")
            return
        for raw in decoded:
            caption = str(raw)
            if len(caption) > 1000:
                a.error.label(400, "errors.invalid_data")
                return
            captions.append(caption)

    # The accounts this post goes to, where the writer overrides the feed's list.
    accounts, accounts_ok = publish_inputs(a)
    if not accounts_ok:
        a.error.label(400, "errors.invalid_accounts")
        return

    # Visibility, content warning, sensitive flag, language and poll (phase 17).
    features, poll, features_ok = post_features_input(a)
    if not features_ok:
        a.error.label(400, "errors.invalid_data")
        return
    if poll:
        data = dict(data) if data else {}
        data["poll"] = poll

    # A link to a post on another network is quoted: its text, image and
    # author travel with the post, so subscribers see the quote as the writer
    # did.
    quote = post_quote(body) if body else None
    if quote:
        data = dict(data) if data else {}
        data["quote"] = quote

    post_uid, attachments, failure = post_create(feed, user_id, a.user.identity.name, body, data, features, accounts, lambda post: attachment_save(a, post, captions=captions))
    if failure:
        fail(a, failure)
        return
    return {
        "data": {
            "id": post_uid,
            "feed": feed_visible(feed, is_feed_owner(user_id, feed)),
            "attachments": attachments
        }
    }

# Mark specific posts as read
def action_posts_read(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id
	posts = a.inputs("post")
	if not posts:
		return {"data": {"ok": True}}
	now = mochi.time.now()
	feed_data = get_feed(a)
	if feed_data and not is_feed_owner(user_id, feed_data) and not is_user_subscribed(user_id, feed_data["id"]):
		a.error.label(403, "errors.access_denied")
		return
	feed_id = feed_data["id"] if feed_data else ""
	for post_id in posts:
		if mochi.text.valid(post_id, "id"):
			if feed_id:
				# Insert stub if post doesn't exist locally (remote feed posts)
				mochi.db.execute("insert or ignore into posts (id, feed, body, data, created, updated, read) values (?, ?, '', '', 0, 0, ?)", post_id, feed_id, now)
				# Scope to the authorized feed so a post id belonging to another
				# feed can't be marked read through this feed's endpoint.
				mochi.db.execute("update posts set read=? where id=? and feed=? and read=0", now, post_id, feed_id)
			else:
				# Aggregate "All feeds" mark-read has no feed context. Post ids are
				# globally unique (primary key), so id alone targets the right row.
				mochi.db.execute("update posts set read=? where id=? and read=0", now, post_id)
	return {"data": {"ok": True}}

# Mark all posts in a feed (or all feeds) as read
def action_read_all(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id
	feed_data = get_feed(a)
	if feed_data and not is_feed_owner(user_id, feed_data) and not is_user_subscribed(user_id, feed_data["id"]):
		a.error.label(403, "errors.access_denied")
		return
	now = mochi.time.now()
	if feed_data:
		mochi.db.execute("update feeds set read=? where id=?", now, feed_data["id"])
		mochi.db.execute("update posts set read=? where feed=? and read=0", now, feed_data["id"])
	else:
		# The route is entity-scoped, so an unresolvable feed means it is gone.
		# Falling through here marked every feed and every post read.
		a.error.label(404, "errors.feed_not_found")
		return
	return {"data": {"ok": True, "read": now}}

# Mark every feed the caller owns or subscribes to as read, in one request. The
# aggregate "All feeds" view used to fire one entity-scoped read-all per feed
# (#176); this class-level action does the whole set at once.
def action_read_all_class(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id
	now = mochi.time.now()

	feed_ids = {}
	for fid in owned_set():
		feed_ids[fid] = True
	for row in mochi.db.rows("select feed from subscribers where id=?", user_id) or []:
		feed_ids[row["feed"]] = True

	for fid in feed_ids:
		mochi.db.execute("update feeds set read=? where id=?", now, fid)
		mochi.db.execute("update posts set read=? where feed=? and read=0", now, fid)

	return {"data": {"ok": True, "read": now, "feeds": len(feed_ids)}}

# Edit a post (owner only)
# post_edit changes a post: on a feed the user owns, a post they wrote or
# one in a feed they manage, its text, data and features, with change(post,
# feed) changing its attachments, published again and sent to the
# subscribers; in a feed of someone else's, asked of its owner. A poll stays
# as it was made, with its votes. Answers (result, None) or (None, failure).
def post_edit(feed_id, post_id, user_id, body, data, features, change):
	info = feed_by_id(user_id, feed_id)
	if not info:
		return None, (404, "errors.feed_not_found")

	if owned(info["id"]):
		# Local feed - edit directly
		post = mochi.db.row("select * from posts where id=? and feed=?", post_id, info["id"])
		if not post:
			return None, (404, "errors.post_not_found")

		if post.get("author") != user_id and not check_access_user(user_id, info["id"], "manage"):
			return None, (403, "errors.not_allowed_edit_post")

		existing = json.decode(post.get("data", "") or "{}", None) or {}
		if type(existing) == "dict" and existing.get("poll"):
			data = dict(data) if data else {}
			data["poll"] = existing["poll"]
		elif data and data.get("poll"):
			data = dict(data)
			data.pop("poll")

		now = mochi.time.now()
		data_value = json.encode(data) if data else ""
		before = mochi.db.row("select body from posts where id=?", post_id)
		mochi.db.execute("update posts set body=?, data=?, updated=?, edited=? where id=?", body, data_value, now, now, post_id)
		if features:
			clause, values = features_sql(features)
			mochi.db.execute("update posts set " + clause + " where id=?", *(values + [post_id]))
		mochi.db.commit.fire("posts", "update", post_id)

		failure = change(post_id, info)
		if failure:
			return None, failure

		post = mochi.db.row("select * from posts where id=?", post_id)
		edit_event = {"post": post_id, "body": body, "edited": now}
		edit_event.update(post_event_features(post))
		if data:
			edit_event["data"] = data
		edit_event["attachments"] = attachment_list(post_id, info["id"])
		edit_event["copies"] = publish_update(info, post_id, body, "markdown", edit_event["attachments"], post)
		webmention_send(info, post_id, [before["body"] if before else "", body], post)
		broadcast_event(info["id"], "post/edit", edit_event, user_id)

		# post/edit WebSocket notification is fired by the commit hook on
		# the update above (see mochi.db.commit.fire / on_db_commit).

		# Re-tag with AI if enabled
		if info.get("ai_mode", ""):
			mochi.db.execute("delete from tags where object=? and source='ai'", post_id)
			mochi.schedule.after("schedule_ai_tag", {"feed": info["id"], "post": post_id}, 0)

		return {"success": True}, None

	elif info.get("server"):
		# Remote feed - send edit to owner
		peer = mochi.remote.peer(info["server"])
		if not peer:
			return None, (502, "errors.unable_to_connect")
		payload = {"feed": feed_id, "post": post_id, "body": body}
		if data:
			payload["data"] = data
		response = mochi.remote.request(feed_id, "feeds", "post/edit", payload, peer)
		if response.get("error"):
			return None, remote_failure(response, 403)
		return response or {"success": True}, None

	return None, (403, "errors.not_allowed")

def action_post_edit(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id

	feed_id = a.input("feed")
	post_id = a.input("post")
	body = a.input("body")

	if not mochi.text.valid(body, "text"):
		a.error.label(400, "errors.invalid_body")
		return

	# Parse extended data (checkin, travelling, etc.)
	data_str = a.input("data")
	data = None
	if data_str:
		data = json.decode(data_str, None)
		if data == None or not validate_post_data(data):
			a.error.label(400, "errors.invalid_data")
			return
		# Validated but not sanitized: an rss.link the validator accepts can
		# still be a javascript: URL, and this is the copy that goes out to
		# every subscriber.
		data = sanitize_post_data(data)

	# Visibility, content warning, sensitive flag and language may change.
	features, _, features_ok = post_features_input(a)
	if not features_ok:
		a.error.label(400, "errors.invalid_data")
		return

	def change(post_id, info):
		"""The attachment changes the form asks for, the answer to a
		failing one."""
		# Order list includes existing IDs and "new:N" placeholders for new files.
		# The web client sends it as one JSON array, so an empty array - every
		# attachment removed - still arrives. Older clients send one field per
		# item, where an empty list cannot be told apart from no change.
		order = a.inputs("order")
		cleared = False
		if len(order) == 1 and order[0].startswith("["):
			decoded = json.decode(order[0], None)
			if type(decoded) != "list":
				return (400, "errors.invalid_data")
			order = [str(item) for item in decoded]
			cleared = len(order) == 0

		# Optional caption edits: a JSON object keyed by attachment id or
		# "new:N" placeholder. Applied only to rows this post holds.
		captions = {}
		captions_raw = a.input("captions")
		if captions_raw:
			decoded = json.decode(captions_raw, None)
			if type(decoded) != "dict" or len(decoded) > 100:
				return (400, "errors.invalid_data")
			for key in decoded:
				caption = str(decoded[key])
				if len(caption) > 1000:
					return (400, "errors.invalid_data")
				captions[key] = caption

		# Save new attachments first (if any files were uploaded), with their
		# captions aligned to the placeholders' upload order.
		new_total = 0
		for item in order:
			if item.startswith("new:"):
				new_total += 1
		new_captions = [captions.get("new:" + str(i), "") for i in range(new_total)]
		new_attachments = attachment_save(a, post_id, captions=new_captions)

		# Build final order by replacing "new:N" placeholders with actual IDs
		final_order = []
		for item in order:
			if item.startswith("new:"):
				if not decimal(item[4:]):
					continue
				idx = int(item[4:])
				if idx < len(new_attachments):
					final_order.append(new_attachments[idx]["id"])
			else:
				final_order.append(item)

		if final_order or cleared:
			attachments_keep(post_id, info["id"], final_order, new_attachments)

		# Caption edits on attachments the post already holds. Bound to this
		# post's own rows, so an id from another post cannot be annotated
		# through this route.
		for att in attachment_list(post_id, info["id"]):
			if att["id"] in captions and captions[att["id"]] != att.get("caption", ""):
				attachment_update(att["id"], captions[att["id"]], att.get("description", ""))
		return None

	result, failure = post_edit(feed_id, post_id, user_id, body, data, features, change)
	if failure:
		fail(a, failure)
		return
	return {"data": result}

# attachments_keep keeps a post's attachments in the order given, its own
# and those just added, and lets the rest go.
def attachments_keep(post_id, feed_id, final_order, new_attachments):
	# Delete attachments not in the final order
	existing = attachment_list(post_id, feed_id)
	for att in existing:
		if att["id"] not in final_order:
			attachment_delete(att["id"])
			# Comments anchored to a removed image keep their text and
			# become plain comments; a remark is not deleted with the
			# photo it was about.
			mochi.db.execute("update comments set attachment='' where post=? and attachment=?", post_id, att["id"])

	# Reorder attachments belonging to this post (positions start at 1). A
	# caller-supplied id naming another post's attachment is skipped, so
	# it cannot be re-ranked through this route (#318).
	held = [att["id"] for att in existing] + [att["id"] for att in new_attachments]
	position = 0
	for att_id in final_order:
		if att_id not in held:
			continue
		position += 1
		attachment_move(att_id, position)

# Delete a post (owner only)
# post_delete deletes a post the user wrote, or one in a feed they manage:
# with its comments, reactions, attachments and copies, here and for the
# subscribers; in a feed of someone else's, asked of its owner. Answers
# (result, None) or (None, failure).
def post_delete(feed_id, post_id, user_id):
	info = feed_by_id(user_id, feed_id)
	if not info:
		return None, (404, "errors.feed_not_found")

	if owned(info["id"]):
		# Local feed - delete directly
		post = mochi.db.row("select * from posts where id=? and feed=?", post_id, info["id"])
		if not post:
			return None, (404, "errors.post_not_found")

		if post.get("author") != user_id and not check_access_user(user_id, info["id"], "manage"):
			return None, (403, "errors.not_allowed_delete_post")


		publish_delete(post_id)
		mochi.db.execute("delete from tags where object=?", post_id)
		mochi.db.execute("delete from reactions where post=?", post_id)
		# The comments' replies on the network go with the post (decision 25).
		for c in mochi.db.rows("select id from comments where post=?", post_id):
			reply_delete(c["id"])
		mochi.db.execute("delete from comments where post=?", post_id)
		mochi.db.execute("delete from post_scores where post=?", post_id)
		attachment_clear(post_id)
		mochi.db.execute("delete from posts where id=?", post_id)
		mochi.db.execute("delete from follows where post=?", post_id)

		broadcast_event(info["id"], "post/delete", {"post": post_id}, user_id)

		# Send WebSocket notification for real-time UI updates (to owner and all subscribers)
		broadcast_websocket(info["id"], {"type": "post/delete", "feed": info["id"], "post": post_id, "sender": user_id})

		return {"success": True}, None

	elif info.get("server"):
		# Remote feed - send delete to owner
		peer = mochi.remote.peer(info["server"])
		if not peer:
			return None, (502, "errors.unable_to_connect")
		response = mochi.remote.request(feed_id, "feeds", "post/delete", {"feed": feed_id, "post": post_id}, peer)
		if response.get("error"):
			return None, remote_failure(response, 403)
		return response or {"success": True}, None

	return None, (403, "errors.not_allowed")

def action_post_delete(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id

	feed_id = a.input("feed")
	post_id = a.input("post")

	result, failure = post_delete(feed_id, post_id, user_id)
	if failure:
		fail(a, failure)
		return
	return {"data": result}

def action_subscribe(a): # feeds_subscribe
	if not a.user.identity.id:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id

	feed_id = a.input("feed")
	server = a.input("server")
	# peer: a libp2p peer id from a mochi://<peer>/<feed> share link. Reaches a
	# PRIVATE feed with no directory listing - the owner shared its location
	# directly (#209). Takes precedence over server-hostname resolution.
	peer = a.input("peer")
	if not mochi.text.valid(feed_id, "entity"):
		a.error.label(400, "errors.invalid_id")
		return

	# You can't subscribe to your own feed (matches action_unsubscribe). Beyond
	# being meaningless, it would overwrite the owned feeds row with a non-empty
	# server and reset privacy, bypassing serve_attachment's private-feed gate.
	if owned(feed_id):
		a.error.label(400, "errors.you_own_feed")
		return

	# Get feed info from remote or directory
	schema = None
	if peer or server:
		if not peer:
			peer = mochi.remote.peer(server)
		if not peer:
			a.error.label(502, "errors.unable_to_connect")
			return
		response = mochi.remote.request(feed_id, "feeds", "info", {"feed": feed_id}, peer)
		if response.get("error"):
			remote_error(a, response, 404)
			return
		feed_name = response.get("name", "")
		schema = mochi.remote.request(feed_id, "feeds", "schema", {}, peer)
	else:
		# Use directory lookup when no server specified
		directory = mochi.directory.get(feed_id)
		if directory == None or len(directory) == 0:
			a.error.label(404, "errors.feed_not_in_directory")
			return
		feed_name = directory["name"]
		server = directory.get("location", "")
		if server:
			peer = mochi.remote.peer(server)
			if peer:
				schema = mochi.remote.request(feed_id, "feeds", "schema", {}, peer)

	fp = mochi.entity.fingerprint(feed_id) or ""
	# populated=0: posts arrive asynchronously from the owner after subscribe;
	# event_sync_complete flips it to 1 when the owner's terminal signal lands.
	# Upsert only the sync columns; a re-subscribe must preserve the user's own
	# banner, sort, read, ai_* and synced columns (replace-into wiped them).
	mochi.db.execute("insert into feeds ( id, name, subscribers, updated, server, fingerprint, populated ) values ( ?, ?, 1, ?, ?, ?, 0 ) on conflict(id) do update set name=excluded.name, updated=excluded.updated, server=excluded.server, fingerprint=excluded.fingerprint, populated=0",
		feed_id, feed_name, mochi.time.now(), server or ("p2p/" + peer if peer else ""), fp)
	mochi.db.execute("replace into subscribers ( feed, id, name ) values ( ?, ?, ? )", feed_id, user_id, a.user.identity.name)

	# Update subscriber count accurately using count query
	mochi.db.execute("update feeds set subscribers=(select count(*) from subscribers where feed=?), updated=? where id=?", feed_id, mochi.time.now(), feed_id)

	# Insert schema data so posts/comments/reactions are available immediately
	if schema and not schema.get("error"):
		insert_feed_schema(feed_id, schema)

	mochi.log.debug("subscribe: sending P2P message from=%s to=%s", user_id, feed_id)
	# Register with the owner. For a private feed reached by a bootstrap peer,
	# send directly to that peer - the feed isn't resolvable via the directory,
	# and this inbound registration is what teaches the owner our location so
	# fan-out flows back (#209).
	if peer:
		send_result = mochi.message.send.peer(peer, headers(user_id, feed_id, "subscribe"), {"name": a.user.identity.name})
	else:
		send_result = mochi.message.send(headers(user_id, feed_id, "subscribe"), {"name": a.user.identity.name})
	if send_result:
		mochi.log.info("subscribe: P2P send failed: %s", send_result)
	mochi.broadcast.touch(feed_id)

	return {
		"data": {"fingerprint": mochi.entity.fingerprint(feed_id)}
	}

def action_unsubscribe(a): # feeds_unsubscribe
	if not a.user.identity.id:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id

	feed_id = a.input("feed")
	if not mochi.text.valid(feed_id, "entity") and not mochi.text.valid(feed_id, "fingerprint"):
		a.error.label(400, "errors.invalid_id")
		return

	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		a.error.label(404, "errors.feed_not_found")
		return
	
	# feed_id might be fingerprint, ensure it is full entity id
	feed_id = feed_data["id"]

	if is_feed_owner(user_id, feed_data):
		a.error.label(400, "errors.you_own_feed")
		return

	mochi.db.execute("delete from subscribers where feed=? and id=?", feed_id, user_id)
	registration_send(feed_data["server"], headers(user_id, feed_id, "unsubscribe"), {})

	# Only delete feed data if no sources still reference this feed
	if not mochi.db.exists("select 1 from sources where type='feed/posts' and url=?", feed_id):
		# tags, post_scores, source_posts and saved key on the POST, not the
		# feed, so deleting the posts alone stranded them: rows that can never
		# be reached again and are never swept, growing with every
		# unsubscribe. Collect the ids before the posts go.
		orphan_ids = [row["id"] for row in mochi.db.rows("select id from posts where feed=?", feed_id) or []]
		if orphan_ids:
			places = ", ".join(["?" for _ in orphan_ids])
			mochi.db.execute("delete from tags where object in (" + places + ")", *orphan_ids)
			mochi.db.execute("delete from post_scores where post in (" + places + ")", *orphan_ids)
			mochi.db.execute("delete from source_posts where post in (" + places + ")", *orphan_ids)
			mochi.db.execute("delete from saved where post in (" + places + ")", *orphan_ids)
		mochi.db.execute("delete from reactions where feed=?", feed_id)
		mochi.db.execute("delete from comments where feed=?", feed_id)
		mochi.db.execute("delete from posts where feed=?", feed_id)
		mochi.db.execute("delete from follows where feed=?", feed_id)
		mochi.db.execute("delete from notifications where feed=?", feed_id)
		mochi.db.execute("delete from subscribers where feed=?", feed_id)
		rss_tokens_revoke(feed_id)
		mochi.db.execute("delete from feeds where id=?", feed_id)

	return {"data": {"success": True}}

# Revoke a feed's RSS access tokens (the core tokens, not just the rss rows) so a
# removed feed's ?token= URL stops authenticating. No-op when the feed has no RSS
# tokens, so it is safe to call from every feed-removal path.
def rss_tokens_revoke(entity_id):
	for r in mochi.db.rows("select token from rss where entity=?", entity_id) or []:
		mochi.token.delete(r["token"])
	mochi.db.execute("delete from rss where entity=?", entity_id)

# Delete a feed (owner only)
def action_delete(a):
	if not a.user.identity.id:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id

	feed_id = a.input("feed")
	if not mochi.text.valid(feed_id, "entity"):
		a.error.label(400, "errors.invalid_feed_id")
		return

	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		a.error.label(404, "errors.feed_not_found")
		return

	if not is_feed_owner(user_id, feed_data):
		a.error.label(403, "errors.not_feed_owner")
		return

	# Notify subscribers that feed is being deleted (before removing subscriber list)
	broadcast_event(feed_id, "deleted", {"feed": feed_id})

	# Its copies on other networks go with it.
	publish_feed_delete(feed_id)

	# Delete attachments for all posts in this feed
	posts = mochi.db.rows("select id from posts where feed=?", feed_id)
	for post in posts:
		attachments = attachment_list(post["id"], feed_id)
		for att in attachments:
			attachment_delete(att["id"])

	# Delete all feed data
	mochi.db.execute("delete from tags where object in (select id from posts where feed=?)", feed_id)
	mochi.db.execute("delete from source_posts where source in (select id from sources where feed=?)", feed_id)
	mochi.db.execute("delete from score_cache where feed=?", feed_id)
	mochi.db.execute("delete from post_scores where post in (select id from posts where feed=?)", feed_id)
	mochi.db.execute("delete from sources where feed=?", feed_id)
	rss_tokens_revoke(feed_id)
	mochi.db.execute("delete from reactions where feed=?", feed_id)
	mochi.db.execute("delete from comments where feed=?", feed_id)
	mochi.db.execute("delete from copies where post in (select id from posts where feed=?)", feed_id)
	mochi.db.execute("delete from posts where feed=?", feed_id)
	mochi.db.execute("delete from follows where feed=?", feed_id)
	mochi.db.execute("delete from notifications where feed=?", feed_id)
	mochi.db.execute("delete from subscribers where feed=?", feed_id)
	mochi.db.execute("delete from feeds where id=?", feed_id)

	# Remove entity from directory
	mochi.entity.delete(feed_id)

	return {"data": {"success": True}}

# Rename a feed
def action_rename(a):
	if not a.user.identity.id:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id

	feed_id = a.input("feed")
	if not mochi.text.valid(feed_id, "entity"):
		a.error.label(400, "errors.invalid_feed_id")
		return

	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		a.error.label(404, "errors.feed_not_found")
		return

	if not is_feed_owner(user_id, feed_data):
		a.error.label(403, "errors.not_feed_owner")
		return

	name = a.input("name")
	if not name or not mochi.text.valid(name, "name"):
		a.error.label(400, "errors.invalid_name")
		return

	# Update entity (triggers directory update and timestamp reset for public feeds)
	mochi.entity.update(feed_id, name=name)

	# Update local feeds table
	mochi.db.execute("update feeds set name=? where id=?", name, feed_id)

	# Broadcast to subscribers
	if owned(feed_data["id"]):
		broadcast_event(feed_id, "update", {"name": name})

	return {"data": {"success": True}}

# Get banner text (owner only, for settings editor)
def action_banner_get(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id
	feed = get_feed(a)
	if not feed:
		a.error.label(404, "errors.feed_not_found")
		return
	if not is_feed_owner(user_id, feed):
		a.error.label(403, "errors.not_feed_owner")
		return
	return {"data": {"banner": feed.get("banner", "")}}

# Set banner text (owner only)
def action_banner_set(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id
	feed = get_feed(a)
	if not feed:
		a.error.label(404, "errors.feed_not_found")
		return
	if not is_feed_owner(user_id, feed):
		a.error.label(403, "errors.not_feed_owner")
		return
	banner = a.input("banner", "")
	if len(banner) > 10000:
		a.error.label(400, "errors.banner_too_long")
		return
	mochi.db.execute("update feeds set banner=? where id=?", banner, feed["id"])
	if owned(feed["id"]):
		broadcast_event(feed["id"], "update", {"banner": banner})
	return {"data": {"success": True}}

def notify_mentions(feed_id, post_id, body, author_id, author_name, comment=""):
	"""Notify only the @mentioned feed subscribers via P2P. `comment` is the
	mentioning comment, empty for the post itself."""
	body_lower = body.lower()
	subscribers = mochi.db.rows(
		"select id, name from subscribers where feed=? and id!=?",
		feed_id, author_id)
	if not subscribers:
		return
	post = mochi.db.row("select body from posts where id=?", post_id)
	post_excerpt = (post.get("body") or "").strip()[:40] if post else ""
	excerpt = body.strip()[:80]
	fp = mochi.entity.fingerprint(feed_id)
	url = "/feeds/" + fp if fp else "/feeds"
	for sub in subscribers:
		name = sub.get("name")
		if name and ("@[" + name + "]").lower() in body_lower:
			mochi.message.send(
				{"from": feed_id, "to": sub["id"], "service": "feeds", "event": "mention/notify"},
				{"post": post_id, "comment": comment, "title": post_excerpt, "excerpt": excerpt, "author": author_name, "url": url}
			)

# comment_create keeps a comment the user writes on a post: on a feed they
# own, kept and sent to the subscribers; on one they follow, sent to its
# owner, with a copy kept where they hold the post. save(comment) keeps the
# comment's attachments; account is the account the reply also goes out
# from, where they chose one (decision 31). Answers ({id, feed, post}, None)
# or (None, failure).
def comment_create(feed_id, post_id, parent_id, user_id, user_name, body, anchor_input, account, input_id, save):
	# Get local feed data if available
	feed = None
	if feed_id and (mochi.text.valid(feed_id, "entity") or mochi.text.valid(feed_id, "fingerprint")):
		feed = feed_by_id(user_id, feed_id)

	# If feed exists locally AND we own it, handle locally
	if feed and owned(feed["id"]):
		feed_id = feed["id"]
		can_fanout = is_feed_owner(user_id, feed)

		if not check_access_user(user_id, feed_id, "comment"):
			return None, (403, "errors.access_denied")

		if not mochi.db.exists("select id from posts where id=? and feed=?", post_id, feed_id):
			return None, (404, "errors.post_not_found")

		# Only check parent exists if this is a reply to another comment (parent_id not empty)
		if parent_id and not mochi.db.exists("select id from comments where id=? and post=?", parent_id, post_id):
			return None, (404, "errors.parent_not_found")

		# A named anchor must be one of this post's own attachments; a
		# reference the post does not hold is an error, not a silent drop -
		# the client asked to anchor and would otherwise believe it had.
		anchor = comment_anchor(post_id, feed_id, anchor_input)
		if anchor_input and not anchor:
			return None, (400, "errors.attachment_not_found")

		uid = input_id if input_id and mochi.text.valid(input_id, "line") else mochi.uid()
		if mochi.db.exists("select id from comments where id=?", uid):
			return None, (500, "errors.duplicate_id")

		now = mochi.time.now()
		mochi.db.execute("insert into comments (id, feed, post, parent, subscriber, name, body, created, attachment) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
			uid, feed_id, post_id, parent_id, user_id, user_name, body, now, anchor)
		mochi.db.commit.fire("comments", "insert", uid)

		# Save comment attachments locally
		attachments = save(uid)
		# The reply from the commenter's own account, where they chose one
		# (decision 31).
		copies = reply_publish(account, post_id, uid, body)

		set_post_updated(post_id)
		set_feed_updated(feed_id)

		# Broadcast to subscribers with attachment metadata
		comment_event = {"id": uid, "post": post_id, "parent": parent_id, "created": now,
			 "subscriber": user_id, "name": user_name, "body": body, "attachment": anchor}
		if attachments:
			comment_event["attachments"] = [{"id": att["id"], "name": att["name"], "size": att["size"], "content_type": att.get("type", ""), "score": att.get("score", 0), "created": att.get("created", now)} for att in attachments]
		if copies:
			comment_event["copies"] = copies
		if can_fanout:
			broadcast_event(feed_id, "comment/create", comment_event, user_id)
			if body:
				notify_mentions(feed_id, post_id, body, user_id, user_name, uid)

		# comment/create WebSocket notification is fired by the commit hook
		# above (see mochi.db.commit.fire / on_db_commit).

		follow(feed["id"], post_id)
		return {"id": uid, "feed": feed_visible(feed, is_feed_owner(user_id, feed)), "post": post_id}, None

	# Subscribed feed or remote feed - forward via P2P to owner
	# Use feed ID from local record if available, otherwise resolve from input
	target_feed_id = feed["id"] if feed else resolve_feed_id(feed_id)
	
	if not target_feed_id or not mochi.text.valid(target_feed_id, "entity"):
		# Could not resolve to valid entity ID
		return None, (404, "errors.feed_not_found")

	if not mochi.text.valid(post_id, "id"):
		return None, (400, "errors.invalid_post_id")

	# Generate comment ID locally (similar to forums pattern)
	uid = input_id if input_id and mochi.text.valid(input_id, "line") else mochi.uid()
	now = mochi.time.now()

	# The anchor is forwarded for the OWNER to judge against the post's rows;
	# locally it is only kept if the subscriber's copy of the post holds it,
	# so a mistyped id never renders as a chip here either.
	anchor = comment_anchor(post_id, target_feed_id, anchor_input)

	# The files are saved first: the owner pulls their bytes from this server
	# while it answers, and its fetch responder finds the feed through the
	# comment row - so a subscriber who holds the post writes that row before
	# asking. The row references the feed and post rows, which a viewer who
	# never subscribed does not hold - the insert failed the foreign key and
	# the request was never sent - and an owner who refuses must leave no
	# copy behind, so a refusal deletes it again.
	attachments = save(uid)
	held = bool(feed) and mochi.db.exists("select id from posts where id=? and feed=?", post_id, target_feed_id)
	if held:
		mochi.db.execute("replace into comments ( id, feed, post, parent, subscriber, name, body, created, attachment ) values ( ?, ?, ?, ?, ?, ?, ?, ?, ? )",
			uid, target_feed_id, post_id, parent_id, user_id, user_name, body, now, anchor)

	# Send comment to feed owner with attachment metadata, and with the reply
	# it went out as from the commenter's own account (decision 31): the
	# reply first, so the owner can match it when it arrives by the network.
	submit_data = {"id": uid, "post": post_id, "parent": parent_id, "body": body, "name": user_name, "attachment": anchor_input}
	if attachments:
		submit_data["attachments"] = [{"id": att["id"], "name": att["name"], "size": att["size"], "content_type": att.get("type", ""), "score": att.get("score", 0), "created": att.get("created", now)} for att in attachments]
	copies = reply_publish(account, post_id, uid, body)
	if copies:
		submit_data["copies"] = copies

	# Use the stream request/response path here instead of message.send.
	# In some remote-view contexts the request is handled outside the subscriber's
	# local user ownership context, which makes message.send reject the "from"
	# entity with "invalid from header".
	response = mochi.remote.request(target_feed_id, "feeds", "comment/add", submit_data)
	if response.get("error"):
		attachment_clear(uid)
		if held:
			mochi.db.execute("delete from comments where id=? and feed=?", uid, target_feed_id)
		mochi.log.info("comment_create: remote request failed: %s", response.get("error"))
		return None, remote_failure(response, 502)

	# The local copy is the one a subscriber sees: the owner's comment/create
	# broadcast is excluded from the commenter.
	if held:
		mochi.db.commit.fire("comments", "insert", uid)
		follow(target_feed_id, post_id)

	return {"id": uid, "feed": target_feed_id, "post": post_id}, None

def action_comment_create(a):
    if not a.user:
        a.error.label(401, "errors.not_logged_in")
        return
    if not a.user.identity or not a.user.identity.id:
        a.error.label(403, "errors.identity_required")
        return
    user_id = a.user.identity.id

    feed_id = a.input("feed")
    post_id = a.input("post")
    parent_id = a.input("parent") or ""
    body = a.input("body")
    # An optional anchor: the id of one of the post's attachments this
    # comment is about. Resolved against the post's rows below.
    anchor_input = a.input("attachment") or ""

    if not mochi.text.valid(body, "text"):
        a.error.label(400, "errors.invalid_body")
        return

    result, failure = comment_create(feed_id, post_id, parent_id, user_id, a.user.identity.name, body, anchor_input, a.input("account", ""), a.input("id"), lambda comment: attachment_save(a, comment))
    if failure:
        fail(a, failure)
        return
    return {"data": result}

# Edit a comment (author only)
# comment_edit changes a comment the user wrote: on a feed they own, here
# and for the subscribers; on one they follow, asked of its owner, with the
# copy here changed at once. post_input names the comment's post where no
# copy is held. Answers (result, None) or (None, failure).
def comment_edit(feed_id, comment_id, post_input, user_id, body):
	info = feed_by_id(user_id, feed_id)
	if not info:
		return None, (404, "errors.feed_not_found")

	if owned(info["id"]):
		# Local feed - verify comment author
		row = mochi.db.row("select * from comments where id=? and feed=?", comment_id, info["id"])
		if not row:
			return None, (404, "errors.comment_not_found")
		if row["subscriber"] != user_id:
			return None, (403, "errors.not_allowed")

		now = mochi.time.now()
		mochi.db.execute("update comments set body=?, edited=? where id=?", body, now, comment_id)
		mochi.db.commit.fire("comments", "update", comment_id)
		set_post_updated(row["post"])
		set_feed_updated(info["id"])
		reply_update(comment_id, body)

		if is_feed_owner(user_id, info):
			broadcast_event(info["id"], "comment/edit", {"comment": comment_id, "post": row["post"], "body": body, "edited": now}, user_id)

		# comment/edit WebSocket notification is fired by the commit hook
		# above (see mochi.db.commit.fire / on_db_commit).

		return {"success": True}, None

	else:
		# Subscriber - send edit request to feed owner via P2P
		# Try to find comment locally (may exist if synced, or may not if only remote)
		row = mochi.db.row("select * from comments where id=? and feed=?", comment_id, info["id"])
		if row:
			# Have local copy - verify author
			if row["subscriber"] != user_id:
				return None, (403, "errors.not_allowed")
			# Update locally for optimistic UI
			now = mochi.time.now()
			mochi.db.execute("update comments set body=?, edited=? where id=?", body, now, comment_id)
			mochi.db.commit.fire("comments", "update", comment_id)
			post_id = row["post"]
			reply_update(comment_id, body)
		else:
			# No local copy - get post_id from URL path
			post_id = post_input
			if not post_id:
				return None, (400, "errors.post_id_required")

		# Send edit request to feed owner (they verify authorization)
		mochi.message.send(
			headers(user_id, info["id"], "comment/edit/submit"),
			{"comment": comment_id, "post": post_id, "body": body}
		)

		return {"success": True}, None

def action_comment_edit(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id

	feed_id = a.input("feed")
	comment_id = a.input("comment")
	body = a.input("body")

	if not mochi.text.valid(body, "text"):
		a.error.label(400, "errors.invalid_body")
		return

	result, failure = comment_edit(feed_id, comment_id, a.input("post"), user_id, body)
	if failure:
		fail(a, failure)
		return
	return {"data": result}

# Delete a comment (author or feed owner)
# comment_delete deletes a comment the user wrote, or one in a feed they
# manage, with the replies to it: on a feed they own, here and for the
# subscribers; on one they follow, asked of its owner. Answers (result,
# None) or (None, failure).
def comment_delete(feed_id, comment_id, post_input, user_id):
	info = feed_by_id(user_id, feed_id)
	if not info:
		return None, (404, "errors.feed_not_found")

	if owned(info["id"]):
		# Local feed - verify author or feed owner
		row = mochi.db.row("select * from comments where id=? and feed=?", comment_id, info["id"])
		if not row:
			return None, (404, "errors.comment_not_found")
		if row["subscriber"] != user_id and not check_access_user(user_id, info["id"], "manage"):
			return None, (403, "errors.not_allowed")

		post_id = row["post"]
		reply_delete(comment_id)
		delete_comment_tree(comment_id)
		set_post_updated(post_id)
		set_feed_updated(info["id"])

		if is_feed_owner(user_id, info):
			broadcast_event(info["id"], "comment/delete", {"comment": comment_id, "post": post_id}, user_id)

		# Send WebSocket notification for real-time UI updates (to owner and all subscribers)
		broadcast_websocket(info["id"], {"type": "comment/delete", "feed": info["id"], "post": post_id, "comment": comment_id, "sender": user_id})

		return {"success": True}, None

	else:
		# Subscriber - send delete request to feed owner via P2P
		# Try to find comment locally (may exist if synced, or may not if only remote)
		row = mochi.db.row("select * from comments where id=? and feed=?", comment_id, info["id"])
		if row:
			# Have local copy - verify author
			if row["subscriber"] != user_id:
				return None, (403, "errors.not_allowed")
			post_id = row["post"]
			# Delete locally for optimistic UI
			reply_delete(comment_id)
			delete_comment_tree(comment_id)
		else:
			# No local copy - get post_id from URL path
			post_id = post_input
			if not post_id:
				return None, (400, "errors.post_id_required")

		# Send delete request to feed owner (they verify authorization)
		mochi.message.send(
			headers(user_id, info["id"], "comment/delete/submit"),
			{"comment": comment_id, "post": post_id}
		)

		return {"success": True}, None

def action_comment_delete(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id

	feed_id = a.input("feed")
	comment_id = a.input("comment")

	result, failure = comment_delete(feed_id, comment_id, a.input("post"), user_id)
	if failure:
		fail(a, failure)
		return
	return {"data": result}

# Proxy a comment author's asset from the people service. Includes both binary
# slots (avatar/banner/favicon) and JSON metadata (style/information) so the
# frontend can render a complete person card for remote commenters.
def action_comment_asset(a):
	asset = a.input("asset")
	if asset not in ("avatar", "banner", "favicon", "style", "information"):
		a.error.label(404, "errors.unknown_asset")
		return
	# Public route - gate on view access first. Without it, knowing a comment id
	# confirmed that identity participated in a private feed.
	feed = get_feed(a)
	if not feed or not check_access(a, feed["id"], "view"):
		a.error.label(403, "errors.access_denied")
		return
	# Bind the comment to the route feed: comment ids are caller-supplied, so an
	# unbound lookup would resolve comments on private feeds.
	row = mochi.db.row("select subscriber from comments where id=? and feed=?", a.input("comment"), feed["id"])
	subscriber = row["subscriber"] if row else ""
	# A person on another network has no Mochi server to stream from: their
	# avatar is where their network keeps it, which the lookup answers.
	if subscriber and not mochi.text.valid(subscriber, "entity"):
		found = mochi.account.resolve(subscriber) if asset == "avatar" else None
		if found and safe_link(found.get("avatar", "")):
			a.header("Cache-Control", "private, max-age=300")
			a.redirect(found["avatar"])
			return
		a.error.label(404, "errors.asset_not_set", asset=asset, log=False)
		return
	return stream_asset(a, subscriber, "people", asset)

# Helper to recursively delete a comment and its replies
def delete_comment_tree(comment_id):
	children = mochi.db.rows("select id from comments where parent=?", comment_id)
	for child in children:
		delete_comment_tree(child["id"])
	attachments = attachment_list(comment_id)
	for att in attachments:
		attachment_delete(att["id"])
	mochi.db.execute("delete from reactions where comment=?", comment_id)
	mochi.db.execute("delete from comments where id=?", comment_id)

def action_post_image(a):
	feed_id = a.input("feed", "")
	post_id = a.input("post", "")
	if not feed_id or not post_id:
		return a.json({"image": ""})

	# Resolve the feed (id or fingerprint). Owned private feeds require view access
	# before exposing the image or triggering a server-side link fetch, mirroring
	# serve_attachment; subscribed feeds carry owner-enforced data locally.
	feed_row = mochi.db.row("select * from feeds where id=? or fingerprint=?", feed_id, feed_id)
	if not feed_row:
		return a.json({"image": ""})
	# View access for owned feeds and replicas. Never gate on server/privacy
	# columns: subscribe leaves privacy at its 'public' default on every replica.
	if not check_access(a, feed_row["id"], "view"):
		a.error.label(403, "errors.feed_is_private")
		return

	post = mochi.db.row("select data from posts where id=? and feed=?", post_id, feed_row["id"])
	if not post:
		return a.json({"image": ""})

	data = json.decode(post["data"], None) or {} if post["data"] else {}
	rss = data.get("rss")
	if not rss:
		return a.json({"image": ""})

	# The stored image is the feed's <media:thumbnail>, often tiny; fetch the
	# article's og:image once and keep it if better. After an attempt the stored
	# image is final, except a post with no image retries daily.
	cached = rss.get("image", "")
	checked = rss.get("image_checked", 0)
	if checked and (cached or checked > mochi.time.now() - 86400):
		return a.json({"image": cached})

	# The route is public, so an anonymous caller reaches here on a public feed.
	# Serve what is stored, but never let an unidentified caller drive an
	# outbound fetch and a write into the owner's database.
	if not a.user:
		return a.json({"image": cached})

	link = rss.get("link", "")
	if not link:
		# Nothing to fetch from; the thumbnail (or nothing) is final.
		rss["image_checked"] = mochi.time.now()
		data["rss"] = rss
		mochi.db.execute("update posts set data=? where id=?", json.encode(data), post_id)
		return a.json({"image": cached})

	image = mochi.url.preview(link)
	if image:
		rss["image"] = image
	rss["image_checked"] = mochi.time.now()
	data["rss"] = rss
	mochi.db.execute("update posts set data=? where id=?", json.encode(data), post_id)
	return a.json({"image": rss.get("image", "")})

# post_react sets or takes back the user's reaction to a post: on a feed
# they own, here and for the subscribers; on one they follow, sent to its
# owner, with the copy here changed at once. account is the account a like
# of a post from Bluesky goes out from. Answers (result, None) or (None,
# failure).
def post_react(feed_id, post_id, user_id, user_name, reaction, account):
	# Get local feed data if available
	feed = None
	if feed_id and (mochi.text.valid(feed_id, "entity") or mochi.text.valid(feed_id, "fingerprint")):
		feed = feed_by_id(user_id, feed_id)

	# If feed exists locally AND we own it, handle reaction locally
	if feed and owned(feed["id"]):
		feed_id = feed["id"]
		can_fanout = is_feed_owner(user_id, feed)

		post_data = mochi.db.row("select * from posts where id=? and feed=?", post_id, feed_id)
		if not post_data:
			return None, (404, "errors.post_not_found")

		# Check access for react permission
		if not check_access_user(user_id, feed_id, "react"):
			return None, (403, "errors.access_denied")

		post_reaction_set(post_data, user_id, user_name, reaction)
		# A like of a post from Bluesky is a like record of the user's hosted
		# account there, taken back with the reaction (phase 19).
		like_publish(post_data, reaction, account)

		# Broadcast to subscribers
		if can_fanout:
			broadcast_event(feed_id, "post/react",
				{"feed": feed_id, "post": post_id, "subscriber": user_id,
				 "name": user_name, "reaction": reaction}, user_id)

		# Send WebSocket notification for real-time UI updates
		mochi.log.debug("feeds.action_post_react local websocket type=react/post feed=%s post=%s sender=%s reaction=%s", feed_id, post_id, user_id, reaction)
		broadcast_websocket(feed_id, {"type": "react/post", "feed": feed_id, "post": post_id, "sender": user_id})

		return {"feed": feed_visible(feed, is_feed_owner(user_id, feed)), "id": post_id, "reaction": reaction}, None

	# Subscribed feed or remote feed - forward via P2P to owner
	target_feed_id = feed["id"] if feed else resolve_feed_id(feed_id)
	
	if not target_feed_id or not mochi.text.valid(target_feed_id, "entity"):
		# Could not resolve to valid entity ID
		return None, (404, "errors.feed_not_found")

	if not mochi.text.valid(post_id, "id"):
		return None, (400, "errors.invalid_post_id")

	# The local copy is optimistic and only possible when this side holds the
	# post: the row references the feed and post rows, and a viewer who never
	# subscribed has neither. The owner's copy is the record.
	if feed and mochi.db.exists("select id from posts where id=? and feed=?", post_id, target_feed_id):
		if reaction:
			mochi.db.execute("replace into reactions ( feed, post, subscriber, name, reaction ) values ( ?, ?, ?, ?, ? )",
				target_feed_id, post_id, user_id, user_name, reaction)
		else:
			mochi.db.execute("delete from reactions where feed=? and post=? and comment='' and subscriber=?",
				target_feed_id, post_id, user_id)

	# Send WebSocket notification for real-time UI updates on subscriber's side
	mochi.log.debug("feeds.action_post_react remote websocket type=react/post feed=%s post=%s sender=%s reaction=%s", target_feed_id, post_id, user_id, reaction)
	broadcast_websocket(target_feed_id, {"type": "react/post", "feed": target_feed_id, "post": post_id, "sender": user_id})

	# Send reaction to feed owner using mochi.message.send (fire-and-forget)
	# Use user's identity directly in 'from' field (not via headers helper)
	# Capture result to prevent any error from propagating and aborting the action.
	send_result = mochi.message.send(
		{"from": user_id, "to": target_feed_id, "service": "feeds", "event": "post/react/submit"},
		{"post": post_id, "reaction": reaction if reaction else "none", "name": user_name}
	)
	if send_result:
		mochi.log.debug("post_react: P2P send result: %s", send_result)

	return {"feed": target_feed_id, "post": post_id, "reaction": reaction}, None

def action_post_react(a):
    if not a.user:
        a.error.label(401, "errors.not_logged_in")
        return
    user_id = a.user.identity.id

    feed_id = a.input("feed")
    post_id = a.input("post")
    reaction_input = a.input("reaction")
    mochi.log.debug("feeds.action_post_react start feed=%s post=%s reaction_input=%s user=%s", feed_id, post_id, reaction_input, user_id)


    result = is_reaction_valid(reaction_input)
    if not result["valid"]:
        a.error.label(400, "errors.invalid_reaction")
        return
    reaction = result["reaction"]

    result, failure = post_react(feed_id, post_id, user_id, a.user.identity.name, reaction, a.input("account", ""))
    if failure:
        fail(a, failure)
        return
    return {"data": result}

# comment_react is post_react for a comment.
def comment_react(feed_id, comment_id, user_id, user_name, reaction):
	# Get local feed data if available
	feed = None
	if feed_id and (mochi.text.valid(feed_id, "entity") or mochi.text.valid(feed_id, "fingerprint")):
		feed = feed_by_id(user_id, feed_id)

	# If feed exists locally AND we own it, handle reaction locally
	if feed and owned(feed["id"]):
		feed_id = feed["id"]
		can_fanout = is_feed_owner(user_id, feed)

		comment_data = mochi.db.row("select * from comments where id=? and feed=?", comment_id, feed_id)
		if not comment_data:
			return None, (404, "errors.comment_not_found")

		# Check access for react permission
		if not check_access_user(user_id, feed_id, "react"):
			return None, (403, "errors.access_denied")

		comment_reaction_set(comment_data, user_id, user_name, reaction)

		# Broadcast to subscribers
		if can_fanout:
			broadcast_event(feed_id, "comment/react",
				{"feed": feed_id, "post": comment_data["post"], "comment": comment_id,
				 "subscriber": user_id, "name": user_name, "reaction": reaction}, user_id)

		# Send WebSocket notification for real-time UI updates
		broadcast_websocket(feed_id, {"type": "react/comment", "feed": feed_id, "post": comment_data["post"], "comment": comment_id, "sender": user_id})

		return {"feed": feed, "post": comment_data["post"], "comment": comment_id, "reaction": reaction}, None

	# Subscribed feed or remote feed - forward via P2P to owner
	target_feed_id = feed["id"] if feed else resolve_feed_id(feed_id)
	
	if not target_feed_id or not mochi.text.valid(target_feed_id, "entity"):
		# Could not resolve to valid entity ID
		return None, (404, "errors.feed_not_found")

	# "line", not "text": "text" allows 1MB, which would land in the reactions
	# table and ride the websocket and P2P send. Not the uid shape either -
	# existing comment ids predate it.
	if not mochi.text.valid(comment_id, "line"):
		return None, (400, "errors.invalid_comment_id")

	# Get post_id for the comment (needed for WebSocket notification)
	comment_row = mochi.db.row("select post from comments where id=?", comment_id)
	post_id_for_ws = comment_row["post"] if comment_row else ""

	# The local copy is optimistic and only possible when this side holds the
	# comment: the row references the feed and post rows.
	if feed and comment_row:
		if reaction:
			mochi.db.execute("replace into reactions ( feed, post, comment, subscriber, name, reaction ) values ( ?, ?, ?, ?, ?, ? )",
				target_feed_id, post_id_for_ws, comment_id, user_id, user_name, reaction)
		else:
			mochi.db.execute("delete from reactions where feed=? and comment=? and subscriber=?",
				target_feed_id, comment_id, user_id)

	# Send WebSocket notification for real-time UI updates on subscriber's side
	broadcast_websocket(target_feed_id, {"type": "react/comment", "feed": target_feed_id, "post": post_id_for_ws, "comment": comment_id, "sender": user_id})

	# Send reaction to feed owner using mochi.message.send (fire-and-forget)
	# Use user's identity directly in 'from' field (not via headers helper)
	# Capture result to prevent any error from propagating and aborting the action.
	send_result = mochi.message.send(
		{"from": user_id, "to": target_feed_id, "service": "feeds", "event": "comment/react/submit"},
		{"comment": comment_id, "post": post_id_for_ws, "reaction": reaction if reaction else "none", "name": user_name}
	)
	if send_result:
		mochi.log.debug("comment_react: P2P send result: %s", send_result)

	return {"feed": target_feed_id, "comment": comment_id, "reaction": reaction}, None

def action_comment_react(a):
    if not a.user:
        a.error.label(401, "errors.not_logged_in")
        return
    if not a.user.identity or not a.user.identity.id:
        a.error.label(403, "errors.identity_required")
        return
    user_id = a.user.identity.id

    feed_id = a.input("feed")
    comment_id = a.input("comment")
    reaction_input = a.input("reaction")
    
    result = is_reaction_valid(reaction_input)
    if not result["valid"]:
        a.error.label(400, "errors.invalid_reaction")
        return
    reaction = result["reaction"]

    result, failure = comment_react(feed_id, comment_id, user_id, a.user.identity.name, reaction)
    if failure:
        fail(a, failure)
        return
    return {"data": result}

# Access control actions

# List access rules for a feed
def action_access_list(a):
    feed = get_feed(a)
    if not feed:
        a.error.label(404, "errors.feed_not_found")
        return

    if not check_access(a, feed["id"], "manage"):
        a.error.label(403, "errors.access_denied")
        return

    # Get owner - if we own this entity, use current user's info
    owner = None
    if owned(feed["id"]):
        if a.user and a.user.identity:
            owner = {"id": a.user.identity.id, "name": a.user.identity.name}

    resource = "feed/" + feed["id"]
    rules = mochi.access.list.resource(resource)

    # Resolve names for rules and mark owner
    filtered_rules = []
    for rule in rules:
        subject = rule.get("subject", "")
        # Mark owner rules
        if owner and subject == owner.get("id"):
            rule["owner"] = True
        # Resolve names for non-special subjects
        if subject and subject not in ("*", "+") and not subject.startswith("#"):
            if subject.startswith("@"):
                # Look up group name
                group_id = subject[1:]  # Remove @ prefix
                group = mochi.group.get(group_id)
                if group:
                    rule["name"] = group.get("name", group_id)
            elif mochi.text.valid(subject, "entity"):
                # Try directory first (for user identities), then local entities
                entry = mochi.directory.get(subject)
                if entry:
                    rule["name"] = entry.get("name", "")
                else:
                    entity = mochi.entity.info(subject)
                    if entity:
                        rule["name"] = entity.get("name", "")
        filtered_rules.append(rule)

    return {"data": {"rules": filtered_rules}}

# Set access level for a subject
# Levels: "comment" (can comment, react, view), "react" (can react, view),
#         "view" (can view only), "none" (explicitly blocked)
# This revokes any existing rules for the subject first, then sets the new level.
def action_access_set(a):
    if not a.user:
        a.error.label(401, "errors.not_logged_in")
        return

    feed = get_feed(a)
    if not feed:
        a.error.label(404, "errors.feed_not_found")
        return

    if not check_access(a, feed["id"], "manage"):
        a.error.label(403, "errors.access_denied")
        return

    subject = a.input("subject")
    level = a.input("level")

    if not subject:
        a.error.label(400, "errors.subject_required")
        return
    if len(subject) > 255:
        a.error.label(400, "errors.subject_too_long")
        return

    if not level:
        a.error.label(400, "errors.level_required")
        return

    if level not in ["view", "react", "comment", "none"]:
        a.error.label(400, "errors.invalid_level")
        return

    resource = "feed/" + feed["id"]
    granter = a.user.identity.id

    # Whether the grant gives a person something they could not already do,
    # read before the old rules go: only that is worth telling them.
    entity = mochi.entity.info(feed["id"])
    owner = entity.get("creator", "") if entity else ""
    news = mochi.text.valid(subject, "entity") and subject != owner and level != "none" and not check_event_access(subject, feed["id"], level)

    # First, revoke all existing rules for this subject (including wildcard)
    for op in ACCESS_LEVELS + ["*"]:
        mochi.access.revoke(subject, resource, op)

    # Then set the new level
    if level == "none":
        # Store deny rules for all levels to block access
        for op in ACCESS_LEVELS:
            mochi.access.deny(subject, resource, op, granter)
        # The rules bind this server's checks; a subscriber reads their own
        # host's copy, which only a removal reaches.
        if mochi.db.exists("select 1 from subscribers where feed=? and id=?", feed["id"], subject):
            subscriber_drop(feed["id"], subject)
    else:
        # Store a single allow rule for the level
        mochi.access.allow(subject, resource, level, granter)

    # Tell them, on their own server, so an invitee to a private feed can find
    # it: it is not in the directory.
    if news:
        mochi.message.send(
            {"from": feed["id"], "to": subject, "service": "feeds", "event": "access/granted"},
            {"level": level, "name": feed["name"]}
        )

    return {"data": {"success": True}}

# subscriber_drop takes a subscriber off a feed this user owns: the roster and
# their reactions, the fan-out list, the replay record, and their own host's
# copy - the "deleted" event tears down exactly the sender's feed there, which
# is what a removed subscriber must see. Access rules stay the caller's.
def subscriber_drop(feed_id, subscriber_id):
    mochi.db.execute("delete from reactions where feed=? and subscriber=?", feed_id, subscriber_id)
    mochi.db.execute("delete from subscribers where feed=? and id=?", feed_id, subscriber_id)
    # Dropping them from the fan-out list stops new posts but not replay: core
    # keeps a subscription record so a lagging subscriber can resync, and it
    # lives on the log's own clock. Without this a removed member could still
    # pull posts made after they were removed.
    mochi.broadcast.subscriber.remove(feed_id, subscriber_id)
    mochi.db.execute("update feeds set subscribers = (select count(*) from subscribers where feed=?) where id=?", feed_id, feed_id)
    # The reason lets their host show and notify a removal rather than a
    # deletion; a host on an older release ignores it and still purges.
    mochi.message.send(headers(feed_id, subscriber_id, "deleted"), {"feed": feed_id, "reason": "removed"})

# Revoke all access from a subject (remove from access list entirely)
def action_access_revoke(a):
    if not a.user:
        a.error.label(401, "errors.not_logged_in")
        return

    feed = get_feed(a)
    if not feed:
        a.error.label(404, "errors.feed_not_found")
        return

    if not check_access(a, feed["id"], "manage"):
        a.error.label(403, "errors.access_denied")
        return

    subject = a.input("subject")

    if not subject:
        a.error.label(400, "errors.subject_required")
        return
    if len(subject) > 255:
        a.error.label(400, "errors.subject_too_long")
        return

    resource = "feed/" + feed["id"]

    # Revoke all rules for this subject (including wildcard)
    for op in ACCESS_LEVELS + ["*"]:
        mochi.access.revoke(subject, resource, op)

    return {"data": {"success": True}}

# Member management actions

# List members (subscribers) of a feed
def action_member_list(a):
    if not a.user:
        a.error.label(401, "errors.not_logged_in")
        return

    feed = get_feed(a)
    if not feed:
        a.error.label(404, "errors.feed_not_found")
        return

    if not check_access(a, feed["id"], "manage"):
        a.error.label(403, "errors.access_denied")
        return

    members = mochi.db.rows("select id, name from subscribers where feed=?", feed["id"])
    return {"data": {"members": members}}

def action_member_search(a):
    if not a.user:
        a.error.label(401, "errors.not_logged_in")
        return
    feed = get_feed(a)
    if not feed:
        a.error.label(404, "errors.feed_not_found")
        return

    # @mention autocomplete, so gate on `comment` (the permission that writes a mention),
    # not manage. Logged-in alone is not enough - a private feed's subscriber
    # names would leak a fragment at a time; check_access admits subscribers.
    if not check_access(a, feed["id"], "comment"):
        a.error.label(403, "errors.access_denied")
        return

    query = (a.input("q") or "").lower().strip()
    if query:
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        members = mochi.db.rows(
            "select id, name from subscribers where feed=? and lower(name) like ? escape '\\'",
            feed["id"], "%" + escaped + "%")
    else:
        members = mochi.db.rows("select id, name from subscribers where feed=?", feed["id"])
    return {"data": {"members": members[:20]}}

# Remove a member. There is deliberately no owner-side add: subscription is
# subscriber-initiated, and a roster entry with no matching row on the member's
# server is unsubscribed by the stale-roster guard on the first broadcast.
def action_member_remove(a):
    if not a.user:
        a.error.label(401, "errors.not_logged_in")
        return

    feed = get_feed(a)
    if not feed:
        a.error.label(404, "errors.feed_not_found")
        return

    if not check_access(a, feed["id"], "manage"):
        a.error.label(403, "errors.access_denied")
        return

    member_id = a.input("member")
    if not member_id or not mochi.text.valid(member_id, "entity"):
        a.error.label(400, "errors.invalid_member_id")
        return

    # Can't remove the owner
    owner_id = None
    entity = mochi.entity.info(feed["id"])
    if entity:
        owner_id = entity.get("creator")
    if member_id == owner_id:
        a.error.label(400, "errors.cannot_remove_owner")
        return

    # Check if actually a member
    if not mochi.db.exists("select 1 from subscribers where feed=? and id=?", feed["id"], member_id):
        a.error.label(404, "errors.not_a_member")
        return

    subscriber_drop(feed["id"], member_id)

    # Revoke all access for this member
    resource = "feed/" + feed["id"]
    for op in ["view", "comment", "react", "manage", "*"]:
        mochi.access.revoke(member_id, resource, op)

    return {"data": {"success": True}}

# Proxy a subscriber's person asset for the roster. Manage-gated like the
# roster, and bound to the subscriber table so it proxies nobody else.
def action_member_asset(a):
    asset = a.input("asset")
    if asset not in ("avatar", "banner", "favicon", "style", "information"):
        a.error.label(404, "errors.unknown_asset")
        return
    if not a.user:
        a.error.label(401, "errors.not_logged_in")
        return
    feed = get_feed(a)
    if not feed:
        a.error.label(404, "errors.feed_not_found")
        return
    if not check_access(a, feed["id"], "manage"):
        a.error.label(403, "errors.access_denied")
        return
    user = a.input("user")
    if not mochi.text.valid(user, "entity") or not mochi.db.exists("select 1 from subscribers where feed=? and id=?", feed["id"], user):
        a.error.label(404, "errors.not_a_member")
        return
    return stream_asset(a, user, "people", asset)

# EVENTS

# unsubscribe_stale asks the owner to drop us when a broadcast arrives for a
# feed we no longer hold. action_subscribe writes the local row before notifying
# the owner, so a missing row is always a stale roster entry, never an in-flight
# subscribe.
def unsubscribe_stale(e):
	feed_id = e.header("from")
	if feed_id:
		mochi.message.send(headers(e.user.identity.id, feed_id, "unsubscribe"))

def event_comment_create(e): # feeds_comment_create_event
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		mochi.log.info("Feeds dropping comment for unknown feed %s (stale subscription); unsubscribing", e.header("from"))
		unsubscribe_stale(e)
		return
	feed_id = feed_data["id"]
		
	comment = {"id": e.content("id"), "post": e.content("post"), "parent": e.content("parent"), "created": e.content("created"), "subscriber": e.content("subscriber"), "name": e.content("name"), "body": e.content("body")}
	# A comment from another network comes as sanitised HTML with its author's
	# page and its id there (phase 16); one of ours carries none of these.
	format = e.content("format") or "text"
	if format not in ("text", "markdown", "html"):
		format = "text"
	page = safe_link(str(e.content("page") or ""))
	remote = str(e.content("remote") or "")
	if len(remote) > 2000:
		remote = ""

	# Validate timestamp is within reasonable range (not more than 1 day in future or 1 year in past)
	now = mochi.time.now()
	created = number(comment["created"])
	if created > now + 86400 or created < now - 31536000:
		mochi.log.info("Feed dropping comment with invalid timestamp")
		return

	# Bounded, not a 1MB cap - see action_comment_react.
	if not mochi.text.valid(comment["id"], "line"):
		mochi.log.info("Feed dropping comment with invalid ID '%s'", comment["id"])
		return

	if mochi.db.exists("select id from comments where id=?", comment["id"]):
		mochi.log.info("Feed dropping comment with duplicate ID '%s'", comment["id"])
		return

	# Skip when the post isn't local yet. comments.post FK would otherwise
	# abort the handler and the comment would be lost. request_resync
	# pulls the canonical schema so we converge on the next event.
	if not mochi.db.exists("select id from posts where id=? and feed=?", comment["post"], feed_id):
		request_resync(feed_id)
		return

	if not mochi.text.valid(comment["name"], "line"):
		mochi.log.debug("Feed dropping comment with invalid name '%s'", comment["name"])
		return

	if not mochi.text.valid(comment["body"], "text"):
		mochi.log.debug("Feed dropping comment with invalid body '%s'", comment["body"])
		return

	# Bind the anchor against the rows we hold: the post's attachments may arrive
	# in a later batch, in which case the comment stores unanchored and sync does
	# not re-anchor it.
	anchor = comment_anchor(comment["post"], feed_id, e.content("attachment"))
	mochi.db.execute("replace into comments ( id, feed, post, parent, subscriber, name, body, format, created, attachment, remote, page ) values ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )", comment["id"], feed_id, comment["post"], comment["parent"], comment["subscriber"], comment["name"], comment["body"], format, comment["created"], anchor, remote, page)
	mochi.db.commit.fire("comments", "insert", comment["id"])

	# Store attachment metadata from the event
	attachments = e.content("attachments") or []
	if attachments:
		attachment_store(attachments, e.header("from"), comment["id"])
	replies_store(comment["id"], e.content("copies"))

	set_post_updated(comment["post"], comment["created"])
	set_feed_updated(feed_id, comment["created"])

	# comment/create WebSocket notification is fired by the commit hook above
	# (see mochi.db.commit.fire / on_db_commit at the top of this file).

	# Create notification for this subscriber about new comment (runs on subscriber's server)
	# Skip notifications for historical comments synced during initial subscription
	if not e.content("sync"):
		notify_comment(feed_id, user_id, comment)

# A feed's owner tells us they gave us access to it. Unsolicited, like a friend
# invitation, since an invitee holds nothing of the feed yet; core
# authenticates "from" to an entity the sender owns, and the level is pinned to
# what access/set grants. The link opens the feed if we hold it, else discovery
# with its share link, which offers to subscribe.
def event_access_granted(e):
	feed_id = e.header("from")
	if not mochi.text.valid(feed_id, "entity"):
		return
	level = e.content("level")
	if level not in ACCESS_LEVELS:
		return
	name = e.content("name")
	if type(name) != "string" or not mochi.text.valid(name, "name"):
		return
	feed_data = feed_by_id(e.user.identity.id, feed_id)
	if feed_data:
		name = feed_data["name"]
		url = post_url(feed_id, "")
	else:
		url = "/feeds/find?link=mochi://" + e.header("peer") + "/" + feed_id
	send_notification(feed_id, "access",
		mochi.app.label("notifications.title.access", feed=name),
		mochi.app.label("notifications.body.access." + level), level, url)

def event_mention_notify(e):
	"""Subscriber receives a mention notification from a feed owner."""
	user_id = e.user.identity.id
	# Only accept a mention from a feed this user actually follows. Otherwise any
	# peer could push a notification with attacker-chosen title/body/destination
	# to any identity (spam / phishing).
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		return
	feed_id = feed_data["id"]
	post_id = e.content("post") or ""
	if post_id and not mochi.text.valid(post_id, "id"):
		return
	title = e.content("title") or ""
	excerpt = e.content("excerpt") or ""
	author = e.content("author") or mochi.app.label("author.fallback")
	# Key on the mentioning comment when there is one: keyed on the post, a
	# mention in a comment reads as a repeat of the post's own and is neither
	# counted nor delivered. An owner too old to send it keys on the post.
	comment = e.content("comment") or ""
	if not mochi.text.valid(comment, "id"):
		comment = ""
	# Build the destination locally from the followed feed - never trust a
	# sender-supplied url.
	send_notification(feed_id, "mention", title,
		mochi.app.label("notifications.body.mentioned", name=author, excerpt=excerpt), comment or post_id, post_url(feed_id, post_id))

def event_comment_edit_submit(e):
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("to"))
	if not feed_data:
		mochi.log.info("Feeds dropping comment edit submission for feed %s not owned here", e.header("to"))
		return
	feed_id = feed_data["id"]

	sender_id = e.header("from")
	comment_id = e.content("comment")
	post_id = e.content("post")
	body = e.content("body")

	# Bounded, not a 1MB cap - see action_comment_react.
	if not mochi.text.valid(comment_id, "line"):
		mochi.log.info("Feed dropping comment edit submit with invalid comment ID")
		return
	if not mochi.text.valid(body, "text"):
		mochi.log.info("Feed dropping comment edit submit with invalid body")
		return

	# Verify comment exists and sender is author
	comment = mochi.db.row("select * from comments where id=? and feed=?", comment_id, feed_id)
	if not comment:
		mochi.log.info("Feed dropping comment edit submit for unknown comment '%s'", comment_id)
		return
	if comment["subscriber"] != sender_id:
		mochi.log.info("Feed dropping comment edit submit from non-author")
		return

	# The comment's real post, not the sender's claimed e.content("post"), drives
	# the update, the websocket and the fan-out (#316).
	post_id = comment["post"]

	now = mochi.time.now()
	mochi.db.execute("update comments set body=?, edited=? where id=?", body, now, comment_id)
	mochi.db.commit.fire("comments", "update", comment_id)
	set_post_updated(post_id)
	set_feed_updated(feed_id)

	# comment/edit WebSocket notification is fired by the commit hook above
	# (see mochi.db.commit.fire / on_db_commit at the top of this file).

	# Broadcast edit to all subscribers
	subs = mochi.db.rows("select * from subscribers where feed=?", feed_id)
	for s in subs:
		if s["id"] == sender_id or s["id"] == user_id:
			continue
		mochi.message.send(
			headers(feed_id, s["id"], "comment/edit"),
			{"comment": comment_id, "post": post_id, "body": body, "edited": now}
		)

# Handle comment delete request from subscriber (owner receiving delete)
def event_comment_delete_submit(e):
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("to"))
	if not feed_data:
		mochi.log.info("Feeds dropping comment delete submission for feed %s not owned here", e.header("to"))
		return
	feed_id = feed_data["id"]

	sender_id = e.header("from")
	comment_id = e.content("comment")
	post_id = e.content("post")

	# Bounded, not a 1MB cap - see action_comment_react.
	if not mochi.text.valid(comment_id, "line"):
		mochi.log.info("Feed dropping comment delete submit with invalid comment ID")
		return

	# Verify comment exists and sender is author
	comment = mochi.db.row("select * from comments where id=? and feed=?", comment_id, feed_id)
	if not comment:
		mochi.log.info("Feed dropping comment delete submit for unknown comment '%s'", comment_id)
		return
	if comment["subscriber"] != sender_id:
		mochi.log.info("Feed dropping comment delete submit from non-author")
		return

	# The comment's real post drives the update, the websocket and the fan-out,
	# not the sender's claimed e.content("post") (#316).
	post_id = comment["post"]

	delete_comment_tree(comment_id)
	set_post_updated(post_id)
	set_feed_updated(feed_id)

	# Send WebSocket notification for real-time UI updates
	fingerprint = mochi.entity.fingerprint(feed_data["id"])
	if fingerprint:
		sender_id = e.header("from")
		mochi.websocket.write(fingerprint, {"type": "comment/delete", "feed": feed_data["id"], "post": post_id, "comment": comment_id, "sender": sender_id})

	# Broadcast delete to all subscribers
	subs = mochi.db.rows("select * from subscribers where feed=?", feed_id)
	for s in subs:
		if s["id"] == sender_id or s["id"] == user_id:
			continue
		mochi.message.send(
			headers(feed_id, s["id"], "comment/delete"),
			{"comment": comment_id, "post": post_id}
		)

def event_comment_reaction(e): # feeds_comment_reaction_event
	user_id = e.user.identity.id
	if not mochi.text.valid(e.content("name"), "name"):
		mochi.log.debug("Feed dropping comment reaction with invalid name '%s'", e.content("name"))
		return
	
	comment_id = e.content("comment")
	post_id = e.content("post")
	
	# Try to get comment data from local DB
	comment_data = mochi.db.row("select * from comments where id=?", comment_id)

	# If comment doesn't exist yet (race condition), use post_id from event
	# The comment will be synced shortly via comment/create event
	if not comment_data:
		mochi.log.info("Feed comment reaction arrived before comment sync, using post_id from event")
		# We'll still process the reaction, just without full comment validation
		if not post_id:
			mochi.log.info("Feed dropping comment reaction with no post_id")
			return
		feed_id_from_event = e.header("from")
		feed_data = feed_by_id(user_id, feed_id_from_event)
		if not feed_data:
			mochi.log.info("Feeds dropping comment reaction for unknown feed %s", feed_id_from_event)
			return
		feed_id = feed_data["id"]
		# reactions.post FK would FK-fail if the post isn't local yet.
		if not mochi.db.exists("select id from posts where id=? and feed=?", post_id, feed_id):
			request_resync(feed_id)
			return
	else:
		comment_id = comment_data["id"]
		post_id = comment_data["post"]
		feed_data = feed_by_id(user_id, comment_data["feed"])
		if not feed_data:
			mochi.log.info("Feeds dropping comment reaction for unknown feed %s", comment_data["feed"])
			return
		feed_id = feed_data["id"]

	result = is_reaction_valid(e.content("reaction"))
	if not result["valid"]:
		mochi.log.info("Feed dropping invalid comment reaction")
		return
	reaction = result["reaction"]

	# Verify event comes from the feed owner
	if e.header("from") != feed_id:
		mochi.log.info("Feed dropping comment reaction from non-owner '%s'", e.header("from"))
		return

	# Apply the reaction locally
	subscriber_id = e.content("subscriber")
	
	# Save reaction to database
	if reaction:
		mochi.log.debug("Saving comment reaction: feed=%s post=%s comment=%s subscriber=%s reaction=%s", feed_id, post_id, comment_id, subscriber_id, reaction)
		mochi.db.execute("replace into reactions ( feed, post, comment, subscriber, name, reaction ) values ( ?, ?, ?, ?, ?, ? )",
			feed_id, post_id, comment_id, subscriber_id, e.content("name"), reaction)
	else:
		mochi.log.debug("Deleting comment reaction: feed=%s comment=%s subscriber=%s", feed_id, comment_id, subscriber_id)
		mochi.db.execute("delete from reactions where feed=? and comment=? and subscriber=?",
			feed_id, comment_id, subscriber_id)

	# Send WebSocket notification for real-time UI updates
	fingerprint = mochi.entity.fingerprint(feed_data["id"])
	if fingerprint:
		mochi.log.debug("Sending WebSocket notification for comment reaction: fingerprint=%s", fingerprint)
		mochi.websocket.write(fingerprint, {"type": "react/comment", "feed": feed_data["id"], "post": post_id, "comment": comment_id, "sender": subscriber_id})
	else:
		mochi.log.debug("No fingerprint found for WebSocket notification")

	# Create notification for subscriber about reaction (runs on subscriber's server)
	# Skip notifications for historical reactions synced during initial subscription
	if not e.content("sync"):
		notify_reaction(feed_id, user_id, post_id, comment_id, subscriber_id, e.content("name"), reaction)

# Handle post reaction submission from subscriber (owner receiving reaction)
def event_post_react_submit(e): # feeds_post_react_submit_event
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("to"))
	if not feed_data:
		mochi.log.info("Feeds dropping post reaction submission for feed %s not owned here", e.header("to"))
		return
	feed_id = feed_data["id"]

	sender_id = e.header("from")
	post_id = e.content("post")
	name = e.content("name")
	mochi.log.debug("feeds.event_post_react_submit start feed=%s post=%s sender=%s reaction=%s user=%s", feed_id, post_id, sender_id, e.content("reaction"), user_id)
	
	if not mochi.text.valid(name, "name"):
		mochi.log.info("Feed dropping post reaction submit with invalid name")
		return

	# Verify post exists
	post_data = mochi.db.row("select * from posts where id=? and feed=?", post_id, feed_id)
	if not post_data:
		mochi.log.info("Feed dropping post reaction submit for unknown post '%s'", post_id)
		return

	# Enforce the react access level, matching the stream-path action_post_react.
	if not check_event_access(sender_id, feed_id, "react"):
		mochi.log.debug("Feed dropping post reaction from member without react access")
		return

	result = is_reaction_valid(e.content("reaction"))
	if not result["valid"]:
		mochi.log.info("Feed dropping invalid post reaction submit")
		return
	reaction = result["reaction"]

	# Store the reaction
	post_reaction_set(post_data, sender_id, name, reaction)

	# Send WebSocket notification to owner for real-time UI updates
	mochi.log.debug("feeds.event_post_react_submit websocket type=react/post feed=%s post=%s sender=%s reaction=%s", feed_id, post_id, sender_id, reaction)
	broadcast_websocket(feed_id, {"type": "react/post", "feed": feed_id, "post": post_id, "sender": sender_id})

	# Create notification for feed owner about reaction (runs on owner's server)
	notify_reaction(feed_id, user_id, post_id, "", sender_id, name, reaction)

	# Broadcast to all other subscribers
	subs = mochi.db.rows("select * from subscribers where feed=?", feed_id)
	for s in subs:
		if s["id"] == sender_id or s["id"] == user_id:
			continue
		mochi.message.send(
			headers(feed_id, s["id"], "post/react"),
			{"feed": feed_id, "post": post_id, "subscriber": sender_id, "name": name, "reaction": reaction}
		)

# Handle comment reaction submission from subscriber (owner receiving reaction)
def event_comment_react_submit(e): # feeds_comment_react_submit_event
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("to"))
	if not feed_data:
		mochi.log.info("Feeds dropping comment reaction submission for feed %s not owned here", e.header("to"))
		return
	feed_id = feed_data["id"]

	sender_id = e.header("from")
	comment_id = e.content("comment")
	post_id = e.content("post")
	name = e.content("name")
	
	if not mochi.text.valid(name, "name"):
		mochi.log.info("Feed dropping comment reaction submit with invalid name")
		return

	# Verify comment exists
	comment_data = mochi.db.row("select * from comments where id=? and feed=?", comment_id, feed_id)
	if not comment_data:
		mochi.log.info("Feed dropping comment reaction submit for unknown comment '%s'", comment_id)
		return

	# Use post_id from event if provided, otherwise from comment_data
	if not post_id:
		post_id = comment_data["post"]

	# Enforce the react access level, matching the stream-path action_comment_react.
	if not check_event_access(sender_id, feed_id, "react"):
		mochi.log.debug("Feed dropping comment reaction from member without react access")
		return

	result = is_reaction_valid(e.content("reaction"))
	if not result["valid"]:
		mochi.log.info("Feed dropping invalid comment reaction submit")
		return
	reaction = result["reaction"]

	# Store the reaction
	comment_reaction_set(comment_data, sender_id, name, reaction)

	# Send WebSocket notification to owner for real-time UI updates
	broadcast_websocket(feed_id, {"type": "react/comment", "feed": feed_id, "post": post_id, "comment": comment_id, "sender": sender_id})

	# Create notification for feed owner about reaction (runs on owner's server)
	notify_reaction(feed_id, user_id, post_id, comment_id, sender_id, name, reaction)

	# Broadcast to all other subscribers
	subs = mochi.db.rows("select * from subscribers where feed=?", feed_id)
	for s in subs:
		if s["id"] == sender_id or s["id"] == user_id:
			continue
		mochi.message.send(
			headers(feed_id, s["id"], "comment/react"),
			{"feed": feed_id, "post": post_id, "comment": comment_id, "subscriber": sender_id, "name": name, "reaction": reaction}
		)

def event_post_create(e): # feeds_post_create_event
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		mochi.log.info("Feeds dropping post for unknown feed %s (stale subscription); unsubscribing", e.header("from"))
		unsubscribe_stale(e)
		return


	post = {"id": e.content("id"), "created": e.content("created"), "body": e.content("body")}

	# Validate timestamp is within reasonable range (not more than 1 day in future or 1 year in past)
	now = mochi.time.now()
	if post["created"] > now + 86400 or post["created"] < now - 31536000:
		mochi.log.info("Feed dropping post with invalid timestamp")
		return

	if not mochi.text.valid(post["id"], "id"):
		mochi.log.info("Feed dropping post with invalid ID '%s'", post["id"])
		return

	existing = mochi.db.row("select body from posts where id=?", post["id"])
	if existing and existing["body"] != "":
		mochi.log.info("Feed dropping post with duplicate ID '%s'", post["id"])
		return

	if not mochi.text.valid(post["body"], "text"):
		mochi.log.info("Feed dropping post with invalid body")
		return

	# Handle extended data (checkin, travelling, etc.)
	data = e.content("data")
	data_str = ""
	if data:
		if not validate_post_data(data):
			mochi.log.info("Feed dropping post with invalid data")
			return
		data = sanitize_post_data(data)
		data_str = json.encode(data)

	# The post's features (phase 17), and for a post from another network its
	# author's id and its id there.
	features = post_features_event(e)
	if features == None:
		mochi.log.info("Feed dropping post with invalid features")
		return
	author = e.content("author")
	if author != None:
		if type(author) != "string" or (author and not mochi.text.valid(author, "author")):
			mochi.log.info("Feed dropping post with invalid author")
			return
		features["author"] = author
	remote = e.content("remote")
	if remote != None:
		if type(remote) != "string" or len(remote) > 2048:
			mochi.log.info("Feed dropping post with invalid remote id")
			return
		features["remote"] = remote

	mmdd = compute_mmdd(post["created"])
	credibility = e.content("credibility") or 100
	# A post written as plain text, from a Mastodon app, says so; one that
	# says nothing is markdown, as the web client writes.
	format = "text" if e.content("format") == "text" else "markdown"
	mochi.db.execute("insert into posts ( id, feed, body, data, format, created, updated, mmdd, credibility ) values ( ?, ?, ?, ?, ?, ?, ?, ?, ? ) on conflict(id) do update set body=excluded.body, data=excluded.data, format=excluded.format, created=excluded.created, updated=excluded.updated, mmdd=excluded.mmdd, credibility=excluded.credibility", post["id"], feed_data["id"], post["body"], data_str, format, post["created"], post["created"], mmdd, credibility)
	if features:
		clause, values = features_sql(features)
		mochi.db.execute("update posts set " + clause + " where id=?", *(values + [post["id"]]))
	mochi.db.commit.fire("posts", "insert", post["id"])

	# Store attachment metadata from the event
	attachments = e.content("attachments") or []
	if attachments:
		attachment_store(attachments, e.header("from"), post["id"])
	copies_store(post["id"], e.content("copies"))

	# Insert any tags included inline with the post event
	tags = e.content("tags") or []
	for t in tags:
		mochi.db.execute("insert or ignore into tags (id, object, label, qid, relevance, source) values (?, ?, ?, ?, ?, ?)",
			t.get("id", ""), post["id"], t.get("label", ""), t.get("qid", ""), t.get("relevance", 0), t.get("source", "manual"))

	# Pre-compute interest score for subscriber
	score_posts_for_viewer([post["id"]], user_id)

	set_feed_updated(feed_data["id"])

	# Copy post into any aggregating feeds that use this as a source
	sender_feed = e.header("from")
	sources = mochi.db.rows("select id, feed, transform from sources where type='feed/posts' and url=?", sender_feed)
	for source in sources:
		# Apply AI transform if configured
		copy_body = post["body"]
		copy_format = "text"
		copy_data = data_str
		t_action, t_fields = transform_post(source.get("transform", ""), source["feed"], {"body": copy_body})
		if t_action == "drop":
			continue
		if t_fields.get("body") != copy_body:
			copy_body = t_fields["body"]
			copy_format = "markdown"
			if copy_data:
				d = json.decode(copy_data, None) or {}
				d.pop("html", None)
				copy_data = json.encode(d)
		copy_id = mochi.uid()
		mochi.db.execute("insert into posts (id, feed, body, data, format, created, updated, mmdd, credibility) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
			copy_id, source["feed"], copy_body, copy_data, copy_format, post["created"], post["created"], mmdd, credibility)
		mochi.db.commit.fire("posts", "insert", copy_id)
		mochi.db.execute("insert or ignore into source_posts (source, post, guid) values (?, ?, ?)",
			source["id"], copy_id, post["id"])
		set_feed_updated(source["feed"])
		publish_sourced(source["feed"], copy_id, copy_body, copy_format, {"remote": post["id"], "name": feed_data.get("name", ""), "link": "", "network": "mochi", "created": post["created"], "transformed": copy_format == "markdown"})
		# Schedule AI tagging for aggregating feed copy
		mochi.schedule.after("schedule_ai_tag", {"feed": source["feed"], "post": copy_id}, 0)

	# post/create WebSocket notification is fired by the commit hook above
	# (see mochi.db.commit.fire / on_db_commit at the top of this file).

	# Create notification for this subscriber about new post (runs on subscriber's server)
	# Skip notifications for historical posts synced during initial subscription,
	# for posts older than the feed's read timestamp (already "caught up"), and
	# when the user has turned new-post notifications off for the feed
	if not e.content("sync") and notification_settings(feed_data["id"])["post"]:
		feed_read = feed_data.get("read", 0)
		if number(post["created"]) > feed_read:
			feed_name = feed_data.get("name", mochi.app.label("feed.name.fallback"))
			fingerprint = mochi.entity.fingerprint(feed_data["id"])
			send_notification(feed_data["id"], "post",
				feed_name,
				mochi.app.label("notifications.body.new_posts", count=1),
				post["id"],
				"/feeds/" + (fingerprint or "")
			)


# Handle post edit event from feed owner (subscriber receiving edit)
def event_post_edit(e):
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		mochi.log.info("Feeds dropping post edit for unknown feed %s (stale subscription); unsubscribing", e.header("from"))
		unsubscribe_stale(e)
		return

	post_id = e.content("post")
	body = e.content("body")
	edited = e.content("edited")
	data = e.content("data")

	if not mochi.text.valid(post_id, "id"):
		mochi.log.info("Feed dropping post edit with invalid post ID")
		return
	if not mochi.text.valid(body, "text"):
		mochi.log.info("Feed dropping post edit with invalid body")
		return

	post = mochi.db.row("select * from posts where id=? and feed=?", post_id, feed_data["id"])
	if not post:
		mochi.log.info("Feed dropping post edit for unknown post '%s'", post_id)
		request_resync(feed_data["id"])
		return

	# The same treatment the create path gives it: validate and sanitize the
	# dict as it arrives and encode once, so rss.link cannot carry a javascript:
	# URL into every subscriber. Encoding first would hand validate_post_data a
	# string, which has no .get.
	data_value = ""
	if data:
		if not validate_post_data(data):
			mochi.log.info("Feed dropping post edit with invalid post data")
			return
		data_value = json.encode(sanitize_post_data(data))
	features = post_features_event(e)
	if features == None:
		mochi.log.info("Feed dropping post edit with invalid features")
		return

	mochi.db.execute("update posts set body=?, data=?, updated=?, edited=? where id=?", body, data_value, edited, edited, post_id)
	if features:
		clause, values = features_sql(features)
		mochi.db.execute("update posts set " + clause + " where id=?", *(values + [post_id]))
	mochi.db.commit.fire("posts", "update", post_id)
	if e.content("copies") != None:
		copies_store(post_id, e.content("copies"))

	# Update attachments from event
	attachments = e.content("attachments")
	if attachments != None:
		attachment_clear(post_id)
		if attachments:
			attachment_store(attachments, e.header("from"), post_id)
		# Anchors that pointed at an attachment the edit removed become
		# plain comments here too, matching the owner.
		kept = [att["id"] for att in attachment_list(post_id, feed_data["id"])]
		for c in mochi.db.rows("select id, attachment from comments where post=? and attachment!=''", post_id):
			if c["attachment"] not in kept:
				mochi.db.execute("update comments set attachment='' where id=?", c["id"])

	set_feed_updated(feed_data["id"])

	# post/edit WebSocket notification is fired by the commit hook above
	# (see mochi.db.commit.fire / on_db_commit at the top of this file).

# Handle post novelty update from feed owner (subscriber receiving novelty score).
# Kept for backward compatibility with senders that still emit one
# event per post; new code on the sender side emits post/novelty/batch.
def event_post_novelty(e):
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		return
	post_id = e.content("post")
	novelty = e.content("novelty")
	if not post_id or novelty == None:
		return
	mochi.db.execute("update posts set novelty=? where id=? and feed=?", novelty, post_id, feed_data["id"])

# Batched novelty update. One broadcast carries every novelty change
# made in a single dedup pass on the owner. Cuts per-pass queue cost
# by an order of magnitude on busy news feeds (task #98).
def event_post_novelty_batch(e):
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		return
	items = e.content("items")
	if not items:
		return
	for item in items:
		post_id = item.get("post")
		novelty = item.get("novelty")
		if not post_id or novelty == None:
			continue
		mochi.db.execute("update posts set novelty=? where id=? and feed=?", novelty, post_id, feed_data["id"])

# Handle post credibility update from feed owner (subscriber receiving bulk credibility change)
def event_post_credibility(e):
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		return
	post_ids = e.content("posts")
	credibility = e.content("credibility")
	if not post_ids or credibility == None:
		return
	post_ids = list(post_ids)
	if len(post_ids) > POSTS_MAXIMUM:
		mochi.log.info("Feeds truncating oversized post/credibility list of %d", len(post_ids))
		post_ids = post_ids[:POSTS_MAXIMUM]
	for batch in chunks(post_ids, BATCH):
		placeholders = ", ".join(["?" for _ in batch])
		args = [credibility] + batch + [feed_data["id"]]
		mochi.db.execute("update posts set credibility=? where id in (" + placeholders + ") and feed=?", *args)
	# Recompute the affected posts so the subscriber's interests sort reflects
	# the new credibility immediately (mirrors event_tag_add). Deleting the rows
	# would drop them to score 0 until an unrelated interest change rescored.
	score_posts_for_viewer(list(post_ids), user_id)

# Handle post delete event from feed owner (subscriber receiving delete)
def event_post_delete(e):
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		mochi.log.info("Feeds dropping post delete for unknown feed %s (stale subscription); unsubscribing", e.header("from"))
		unsubscribe_stale(e)
		return

	post_id = e.content("post")
	if not mochi.text.valid(post_id, "id"):
		mochi.log.info("Feed dropping post delete with invalid post ID")
		return

	post = mochi.db.row("select * from posts where id=? and feed=?", post_id, feed_data["id"])
	if not post:
		mochi.log.info("Feed dropping post delete for unknown post '%s'", post_id)
		return

	mochi.db.execute("delete from tags where object=?", post_id)
	mochi.db.execute("delete from reactions where post=?", post_id)
	# The comments' replies on the network go with the post (decision 25).
	for c in mochi.db.rows("select id from comments where post=?", post_id):
		reply_delete(c["id"])
	mochi.db.execute("delete from comments where post=?", post_id)
	mochi.db.execute("delete from post_scores where post=?", post_id)
	attachment_clear(post_id)
	mochi.db.execute("delete from copies where post=?", post_id)
	mochi.db.execute("delete from posts where id=?", post_id)
	mochi.db.execute("delete from follows where post=?", post_id)
	set_feed_updated(feed_data["id"])

	# Send WebSocket notification for real-time UI updates
	fingerprint = mochi.entity.fingerprint(feed_data["id"])
	if fingerprint:
		sender_id = e.header("from")
		mochi.websocket.write(fingerprint, {"type": "post/delete", "feed": feed_data["id"], "post": post_id, "sender": sender_id})

# Handle comment edit event from feed owner (subscriber receiving edit)
def event_comment_edit(e):
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		mochi.log.info("Feeds dropping comment edit for unknown feed %s (stale subscription); unsubscribing", e.header("from"))
		unsubscribe_stale(e)
		return

	comment_id = e.content("comment")
	post_id = e.content("post")
	body = e.content("body")
	edited = e.content("edited")

	if not mochi.text.valid(comment_id, "id"):
		mochi.log.info("Feed dropping comment edit with invalid comment ID")
		return
	if not mochi.text.valid(body, "text"):
		mochi.log.info("Feed dropping comment edit with invalid body")
		return

	comment = mochi.db.row("select * from comments where id=? and feed=?", comment_id, feed_data["id"])
	if not comment:
		mochi.log.info("Feed dropping comment edit for unknown comment '%s'", comment_id)
		request_resync(feed_data["id"])
		return

	mochi.db.execute("update comments set body=?, edited=? where id=?", body, edited, comment_id)
	mochi.db.commit.fire("comments", "update", comment_id)
	set_post_updated(post_id)
	set_feed_updated(feed_data["id"])

	# comment/edit WebSocket notification is fired by the commit hook above
	# (see mochi.db.commit.fire / on_db_commit at the top of this file).

# Handle comment delete event from feed owner (subscriber receiving delete)
def event_comment_delete(e):
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		mochi.log.info("Feeds dropping comment delete for unknown feed %s (stale subscription); unsubscribing", e.header("from"))
		unsubscribe_stale(e)
		return

	comment_id = e.content("comment")
	post_id = e.content("post")

	if not mochi.text.valid(comment_id, "id"):
		mochi.log.info("Feed dropping comment delete with invalid comment ID")
		return

	comment = mochi.db.row("select * from comments where id=? and feed=?", comment_id, feed_data["id"])
	if not comment:
		mochi.log.info("Feed dropping comment delete for unknown comment '%s'", comment_id)
		return

	delete_comment_tree(comment_id)
	set_post_updated(post_id)
	set_feed_updated(feed_data["id"])

	# Send WebSocket notification for real-time UI updates
	fingerprint = mochi.entity.fingerprint(feed_data["id"])
	if fingerprint:
		sender_id = e.header("from")
		mochi.websocket.write(fingerprint, {"type": "comment/delete", "feed": feed_data["id"], "post": post_id, "comment": comment_id, "sender": sender_id})

def event_post_reaction(e): # feeds_post_reaction_event
	user_id = e.user.identity.id
	mochi.log.debug("feeds.event_post_reaction start feed=%s post=%s sender=%s reaction=%s user=%s", e.header("from"), e.content("post"), e.content("subscriber"), e.content("reaction"), user_id)
	if not mochi.text.valid(e.content("name"), "name"):
		mochi.log.debug("Feed dropping post reaction with invalid name '%s'", e.content("name"))
		return
	
	post_data = mochi.db.row("select * from posts where id=?", e.content("post"))
	if not post_data:
		mochi.log.info("Feed dropping post reaction for unknown post")
		# Out-of-order: the post hasn't been delivered yet. Resync via the
		# feed header so we converge.
		feed_id_from_event = e.header("from")
		if feed_id_from_event:
			request_resync(feed_id_from_event)
		return
	post_id = post_data["id"]

	feed_data = feed_by_id(user_id, post_data["feed"])
	if not feed_data:
		mochi.log.info("Feeds dropping post reaction for unknown feed %s", post_data["feed"])
		return
	feed_id = feed_data["id"]

	result = is_reaction_valid(e.content("reaction"))
	if not result["valid"]:
		mochi.log.info("Feed dropping invalid post reaction")
		return
	reaction = result["reaction"]

	# Verify event comes from the feed owner
	if e.header("from") != feed_id:
		mochi.log.info("Feed dropping post reaction from non-owner '%s'", e.header("from"))
		return

	# Apply the reaction locally
	subscriber_id = e.content("subscriber")
	post_reaction_set(post_data, subscriber_id, e.content("name"), reaction)

	# Send WebSocket notification for real-time UI updates
	fingerprint = mochi.entity.fingerprint(feed_data["id"])
	if fingerprint:
		mochi.log.debug("feeds.event_post_reaction websocket type=react/post feed=%s post=%s sender=%s reaction=%s", feed_data["id"], post_id, subscriber_id, reaction)
		mochi.websocket.write(fingerprint, {"type": "react/post", "feed": feed_data["id"], "post": post_id, "sender": subscriber_id})

	# Create notification for subscriber about reaction (runs on subscriber's server)
	# Skip notifications for historical reactions synced during initial subscription
	if not e.content("sync"):
		notify_reaction(feed_id, user_id, post_id, "", subscriber_id, e.content("name"), reaction)

# Handle feed info request from remote server (stream-based)
def event_info(e):
	user_id = e.user.identity.id if e.user and e.user.identity else None
	feed_id = e.header("to")

	entity = mochi.entity.info(feed_id)
	if not entity or entity.get("class") != "feed":
		e.stream.write({"error": "errors.feed_not_found"})
		return

	# A private feed's name/fingerprint is only disclosed to a caller with
	# view access - knowing the id (e.g. from a share link) must not reveal it.
	if not check_event_access(e.header("from"), feed_id, "view"):
		e.stream.write({"error": "errors.access_denied"})
		return

	e.stream.write({
		"id": entity["id"],
		"name": entity["name"],
		"fingerprint": entity.get("fingerprint", mochi.entity.fingerprint(feed_id)),
		"privacy": entity.get("privacy", "public"),
	})

# Return full feed content for reliable subscription sync
def event_schema(e):
	feed_id = e.header("to")
	entity = mochi.entity.info(feed_id)
	if not entity or entity.get("class") != "feed":
		e.stream.write({"error": "errors.feed_not_found"})
		return

	# A private feed's full content (posts/comments/reactions) is only served
	# to a caller who holds view access. Any peer can invoke this event
	# directly with the feed id, so gating registration (event_subscribe) is
	# not enough - the content dump itself must check the caller (#209).
	if not check_event_access(e.header("from"), feed_id, "view"):
		e.stream.write({"error": "errors.access_denied"})
		return

	# Comments and reactions are bounded the same way posts are: an unbounded
	# dump of a large feed's whole comment/reaction history could run to tens of
	# thousands of rows in one event.
	# Comments and reactions come from the dumped posts only: a comment on an
	# older post would name a post the subscriber never receives.
	window = "select id from posts where feed=? order by created desc limit 1000"
	posts = mochi.db.rows("select id, body, data, created, updated, edited, up, down from posts where feed=? order by created desc limit 1000", feed_id) or []
	comments = mochi.db.rows("select id, post, parent, subscriber, name, body, created, edited, attachment from comments where feed=? and post in (" + window + ") order by created limit 1000", feed_id, feed_id) or []
	reactions = mochi.db.rows("select post, comment, subscriber, name, reaction from reactions where feed=? and post in (" + window + ") limit 1000", feed_id, feed_id) or []

	# Nest tags within each post for atomic delivery
	all_tags = mochi.db.rows("select id, object, label, qid, relevance, source from tags where object in (select id from posts where feed=?)", feed_id) or []
	tags_by_post = {}
	for t in all_tags:
		pid = t.get("object", "")
		if pid not in tags_by_post:
			tags_by_post[pid] = []
		tags_by_post[pid].append({"id": t["id"], "label": t["label"], "qid": t.get("qid", ""), "relevance": t.get("relevance", 0), "source": t.get("source", "manual")})

	# Attachment metadata for every dumped post and comment in one query, grouped
	# by object id, rather than a query per row. Metadata only — files still fetch
	# on demand from the owner.
	attachments_by_object = attachment_list_many([p["id"] for p in posts] + [c["id"] for c in comments], feed_id)

	for p in posts:
		post_tags = tags_by_post.get(p["id"], [])
		if post_tags:
			p["tags"] = post_tags
		# Inline attachment metadata so subscribers can't lose it when the subsequent
		# post/create event from send_recent_posts is dropped by the duplicate-body guard
		# in event_post_create.
		atts = attachments_by_object.get(p["id"], [])
		if atts:
			p["attachments"] = atts

	for c in comments:
		atts = attachments_by_object.get(c["id"], [])
		if atts:
			c["attachments"] = atts

	e.stream.write({
		"posts": posts,
		"comments": comments,
		"reactions": reactions,
	})

# True if post_id is held locally under THIS feed. The owner's dump can name a
# post the subscriber lacks - outside the dump window, or dropped - or one that
# collides with another local feed's post; comments, reactions and tags key on
# the post alone and must be grafted onto neither.
def held_post(post_id, feed_id):
	if not post_id:
		return False
	return mochi.db.exists("select 1 from posts where id=? and feed=?", post_id, feed_id)

# True if comment_id is held locally under this feed.
def held_comment(comment_id, feed_id):
	if not comment_id:
		return False
	return mochi.db.exists("select 1 from comments where id=? and feed=?", comment_id, feed_id)

# Insert feed schema data into local database
def insert_feed_schema(feed_id, schema):
	for p in (schema.get("posts") or []):
		mmdd = compute_mmdd(p.get("created", 0))
		mochi.db.execute(
			"insert or ignore into posts (id, feed, body, data, created, updated, edited, up, down, mmdd) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			p.get("id", ""), feed_id, p.get("body", ""), safe_post_data(p.get("data", "")),
			p.get("created", 0), p.get("updated", 0), p.get("edited", 0),
			p.get("up", 0), p.get("down", 0), mmdd
		)
		# A colliding id may name a post owned by another feed; only attach to
		# posts that belong to this one, matching the loops below.
		atts = p.get("attachments") or []
		if atts and held_post(p.get("id", ""), feed_id):
			attachment_store(atts, feed_id, p.get("id", ""))
	for c in (schema.get("comments") or []):
		# Only onto a post held under this feed: the dump may name one outside
		# its window, or one that collides with another feed's post.
		if not held_post(c.get("post", ""), feed_id):
			continue
		mochi.db.execute(
			"insert or ignore into comments (id, feed, post, parent, subscriber, name, body, created, edited, attachment) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			c.get("id", ""), feed_id, c.get("post", ""), c.get("parent", ""),
			c.get("subscriber", ""), c.get("name", ""), c.get("body", ""),
			c.get("created", 0), c.get("edited", 0),
			comment_anchor(c.get("post", ""), feed_id, c.get("attachment", ""))
		)
		atts = c.get("attachments") or []
		if atts:
			attachment_store(atts, feed_id, c.get("id", ""))
	for r in (schema.get("reactions") or []):
		# Only onto a post, and a comment when it names one, held under this feed.
		if not held_post(r.get("post", ""), feed_id):
			continue
		if r.get("comment", "") and not held_comment(r.get("comment", ""), feed_id):
			continue
		mochi.db.execute(
			"insert or ignore into reactions (feed, post, comment, subscriber, name, reaction) values (?, ?, ?, ?, ?, ?)",
			feed_id, r.get("post", ""), r.get("comment", ""),
			r.get("subscriber", ""), r.get("name", ""), r.get("reaction", "")
		)
	# Insert tags from inline post tags (new format) and top-level tags array (backward compat)
	for p in (schema.get("posts") or []):
		# Only tag posts held under this feed.
		if not held_post(p.get("id", ""), feed_id):
			continue
		for t in (p.get("tags") or []):
			mochi.db.execute(
				"insert or ignore into tags (id, object, label, qid, relevance, source) values (?, ?, ?, ?, ?, ?)",
				t.get("id", ""), p.get("id", ""), t.get("label", ""),
				t.get("qid", ""), number(t.get("relevance"), 0.0), t.get("source", "manual")
			)
	for t in (schema.get("tags") or []):
		if not held_post(t.get("object", ""), feed_id):
			continue
		mochi.db.execute(
			"insert or ignore into tags (id, object, label, qid, relevance, source) values (?, ?, ?, ?, ?, ?)",
			t.get("id", ""), t.get("object", ""), t.get("label", ""),
			t.get("qid", ""), number(t.get("relevance"), 0.0), t.get("source", "manual")
		)

def event_subscribe(e): # feeds_subscribe_event
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("to"))
	if not feed_data:
		return

	name = e.content("name")
	if not mochi.text.valid(name, "line"):
		return

	# Private feeds only accept subscribers who already hold view access via an
	# explicit ACL grant. Without this gate any peer could subscribe and be sent
	# all content, since subscribers get implicit view/react/comment access.
	requester = e.header("from")
	if not check_event_access(requester, feed_data["id"], "view"):
		return

	# Only a genuinely new subscription replays the feed's history and re-announces
	# the roster; a peer re-sending subscribe must not make the owner re-emit the
	# whole feed each call (#319).
	newly = not mochi.db.exists("select 1 from subscribers where feed=? and id=?", feed_data["id"], requester)

	mochi.db.execute("insert or ignore into subscribers ( feed, id, name ) values ( ?, ?, ? )", feed_data["id"], e.header("from"), name)
	# Record them for replay now rather than waiting for the next post to do
	# it, so a gap before that post can still be healed.
	if newly:
		mochi.broadcast.subscriber.add(feed_data["id"], e.header("from"))
	mochi.db.execute("update feeds set subscribers=(select count(*) from subscribers where feed=?), updated=? where id=?", feed_data["id"], mochi.time.now(), feed_data["id"])

	if newly:
		feed_update(user_id, feed_data)

	# Send WebSocket notification for real-time UI updates
	fingerprint = mochi.entity.fingerprint(feed_data["id"])
	if fingerprint:
		mochi.websocket.write(fingerprint, {"type": "feed/update", "feed": feed_data["id"]})

	if newly:
		send_recent_posts(user_id, feed_data, e.header("from"))

	# Terminal signal: tell the new subscriber the initial bulk content is fully
	# sent, so it can flip its feed out of the loading state. Sent here (not in
	# send_recent_posts, which returns early for an empty feed) so it always
	# fires, even when the feed has no posts.
	mochi.message.send(headers(feed_data["id"], e.header("from"), "sync/complete"), {"feed": feed_data["id"]})


def event_sync_complete(e): # feeds_sync_complete_event
	# A subscribed feed's owner has finished pushing the initial posts/comments.
	# Mark the local copy populated and tell the browser to refresh so the feed
	# leaves its loading state. from = the feed entity (see send headers above).
	feed_id = e.header("from")
	if not feed_id:
		return
	mochi.db.execute("update feeds set populated=1 where id=?", feed_id)
	fp = mochi.entity.fingerprint(feed_id)
	if fp:
		mochi.websocket.write(fp, {"type": "feed/update", "feed": feed_id})


def event_unsubscribe(e): # feeds_unsubscribe_event
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("to"))
	if not feed_data:
		return

	member_id = e.header("from")

	# Clean up member's reactions
	mochi.db.execute("delete from reactions where feed=? and subscriber=?", e.header("to"), member_id)

	# Remove from subscribers
	mochi.db.execute("delete from subscribers where feed=? and id=?", e.header("to"), member_id)
	# Stop serving them replay of this feed's stream as well as new posts.
	mochi.broadcast.subscriber.remove(e.header("to"), member_id)

	# Revoke all access
	resource = "feed/" + e.header("to")
	for op in ["view", "comment", "react", "manage", "*"]:
		mochi.access.revoke(member_id, resource, op)

	feed_update(user_id, feed_data)

	# Send WebSocket notification for real-time UI updates
	fingerprint = mochi.entity.fingerprint(feed_data["id"])
	if fingerprint:
		mochi.websocket.write(fingerprint, {"type": "feed/update", "feed": feed_data["id"]})

# Handle tag add submit from a subscriber (received by feed owner)
def event_tag_add_submit(e):
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("to"))
	if not feed_data:
		return
	feed_id = feed_data["id"]
	sender_id = e.header("from")
	post_id = e.content("post")
	label = e.content("label")
	if not post_id or not label:
		return

	# Verify post exists
	post = mochi.db.row("select * from posts where id=? and feed=?", post_id, feed_id)
	if not post:
		return

	# Verify sender is a subscriber
	sub_data = get_feed_subscriber(feed_data, sender_id)
	if not sub_data:
		return

	label = validate_tag(label)
	if not label:
		return

	# Deduplicate
	existing = mochi.db.row("select id from tags where object=? and label=?", post_id, label)
	if existing:
		return

	tag_id = mochi.uid()
	results = mochi.qid.search(label, "en")
	if not results:
		return
	qid = results[0]["qid"]

	# Deduplicate by QID — another tag on this post may already cover the same entity
	if mochi.db.exists("select 1 from tags where object=? and qid=?", post_id, qid):
		return

	mochi.db.execute("insert into tags (id, object, label, qid) values (?, ?, ?, ?)", tag_id, post_id, label, qid)

	# Broadcast to all subscribers
	broadcast_event(feed_id, "tag/add", {"id": tag_id, "object": post_id, "label": label, "qid": qid, "source": "manual"})
	broadcast_websocket(feed_id, {"type": "tag/add", "feed": feed_id, "post": post_id, "tag": {"id": tag_id, "label": label, "qid": qid, "source": "manual"}, "sender": sender_id})

# Handle tag remove submit from a subscriber (received by feed owner)
def event_tag_remove_submit(e):
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("to"))
	if not feed_data:
		return
	feed_id = feed_data["id"]
	sender_id = e.header("from")
	post_id = e.content("post")
	tag_id = e.content("tag")
	if not tag_id:
		return

	# The tag's post must belong to this feed - matches event_tag_add_submit.
	if not post_id or not mochi.db.exists("select 1 from posts where id=? and feed=?", post_id, feed_id):
		return

	# Verify sender is a subscriber
	sub_data = get_feed_subscriber(feed_data, sender_id)
	if not sub_data:
		return

	# Look up canonical ID by label before deleting — the subscriber's temp ID
	# may differ from the owner's canonical ID when add-then-remove happens
	# before P2P reconciliation completes.
	label = e.content("label")
	canonical_id = tag_id
	if label:
		canonical = mochi.db.row("select id from tags where object=? and label=?", post_id, label)
		if canonical:
			canonical_id = canonical["id"]

	mochi.db.execute("delete from tags where id=? and object=?", canonical_id, post_id)
	if label and canonical_id != tag_id:
		mochi.db.execute("delete from tags where id=? and object=?", tag_id, post_id)

	# Broadcast with canonical ID and label so subscribers can match their local tags
	broadcast_event(feed_id, "tag/remove", {"id": canonical_id, "object": post_id, "label": label})
	broadcast_websocket(feed_id, {"type": "tag/remove", "feed": feed_id, "post": post_id, "tag": canonical_id, "sender": sender_id})

# Handle tag add event from feed owner.
# Kept for backward compatibility with senders that still emit one
# event per tag; new AI tag passes emit tag/add/batch.
def event_tag_add(e):
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		return
	tag_id = e.content("id")
	object_id = e.content("object")
	label = e.content("label")
	if not tag_id or not object_id or not label:
		return
	# The tagged post must belong to the sending feed - otherwise a subscribed
	# feed could tag posts in another of the user's feeds.
	if not mochi.db.exists("select 1 from posts where id=? and feed=?", object_id, feed_data["id"]):
		return
	qid = e.content("qid") or ""
	relevance = e.content("relevance") or 0
	source = e.content("source") or "manual"
	# If we already have this tag locally (e.g. subscriber added it before owner broadcast),
	# update to the owner's canonical ID so removes stay in sync across P2P.
	existing = mochi.db.row("select id from tags where object=? and label=?", object_id, label)
	if existing:
		if existing["id"] != tag_id:
			mochi.db.execute("update tags set id=?, qid=?, relevance=?, source=? where id=?", tag_id, qid, relevance, source, existing["id"])
	else:
		mochi.db.execute("insert or ignore into tags (id, object, label, qid, relevance, source) values (?, ?, ?, ?, ?, ?)", tag_id, object_id, label, qid, relevance, source)
	# Re-score post when AI tags arrive (tags may come after the post)
	if source == "ai" and qid:
		score_posts_for_viewer([object_id], user_id)

	fingerprint = mochi.entity.fingerprint(feed_data["id"])
	if fingerprint:
		mochi.websocket.write(fingerprint, {"type": "tag/add", "feed": feed_data["id"], "post": object_id, "tag": {"id": tag_id, "label": label, "source": source, "relevance": relevance}})

# Batched tag/add. One broadcast carries every tag added in a single
# AI tag pass on the owner. Cuts per-pass queue cost from N tags x
# subscribers to 1 x subscribers (task #99). The local apply, rescore,
# and WebSocket fanout mirror event_tag_add per item.
def event_tag_add_batch(e):
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		return
	items = e.content("items")
	if not items:
		return
	fingerprint = mochi.entity.fingerprint(feed_data["id"])
	rescore_posts = []
	rescore_seen = {}
	for item in items:
		tag_id = item.get("id", "")
		object_id = item.get("object", "")
		label = item.get("label", "")
		if not tag_id or not object_id or not label:
			continue
		# The tagged post must belong to the sending feed (see event_tag_add).
		if not mochi.db.exists("select 1 from posts where id=? and feed=?", object_id, feed_data["id"]):
			continue
		qid = item.get("qid", "") or ""
		relevance = item.get("relevance", 0) or 0
		source = item.get("source", "manual") or "manual"
		existing = mochi.db.row("select id from tags where object=? and label=?", object_id, label)
		if existing:
			if existing["id"] != tag_id:
				mochi.db.execute("update tags set id=?, qid=?, relevance=?, source=? where id=?", tag_id, qid, relevance, source, existing["id"])
		else:
			mochi.db.execute("insert or ignore into tags (id, object, label, qid, relevance, source) values (?, ?, ?, ?, ?, ?)", tag_id, object_id, label, qid, relevance, source)
		if source == "ai" and qid and object_id not in rescore_seen:
			rescore_seen[object_id] = True
			rescore_posts.append(object_id)
		if fingerprint:
			mochi.websocket.write(fingerprint, {"type": "tag/add", "feed": feed_data["id"], "post": object_id, "tag": {"id": tag_id, "label": label, "source": source, "relevance": relevance}})
	# One re-score per unique post, not per tag - 5x cheaper for a
	# typical AI pass that resolves 5 tags for the same post.
	if rescore_posts:
		score_posts_for_viewer(rescore_posts, user_id)

# Handle tag remove event from feed owner
def event_tag_remove(e):
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		return
	tag_id = e.content("id")
	if not tag_id:
		return
	object_id = e.content("object")
	label = e.content("label")
	# Only touch tags on a post that belongs to the sending feed. Without this a
	# subscribed feed could delete tags on another of the user's feeds, or - via
	# the bare tag id - any tag at all.
	if not object_id or not mochi.db.exists("select 1 from posts where id=? and feed=?", object_id, feed_data["id"]):
		return
	mochi.db.execute("delete from tags where id=? and object=?", tag_id, object_id)
	if label:
		mochi.db.execute("delete from tags where object=? and label=?", object_id, label)
	fingerprint = mochi.entity.fingerprint(feed_data["id"])
	if fingerprint:
		mochi.websocket.write(fingerprint, {"type": "tag/remove", "feed": feed_data["id"], "post": object_id, "tag": tag_id})

# Handle notification that a feed has been deleted by its owner, or that the
# owner removed us from it
def event_deleted(e):
	# Derive the target from the claim-verified sender only. Trusting
	# e.content("feed") let any peer name an unrelated feed - including one this
	# user owns - and erase its posts, roster, tokens and feed row. The sender may
	# only tear down its own subscription copy here.
	feed_id = e.header("from")
	if not feed_id:
		return

	# Act only on a feed we actually hold, and never on one we own: an owner's
	# authoritative data must not be purgeable by an inbound event (event_update
	# guards the same way).
	feed = mochi.db.row("select * from feeds where id=?", feed_id)
	if not feed or owned(feed_id):
		return

	# Delete local subscription data for this feed
	mochi.db.execute("delete from tags where object in (select id from posts where feed=?)", feed_id)
	mochi.db.execute("delete from reactions where feed=?", feed_id)
	# The library sweep only removes files with no row, so the rows must go
	# here or every image the feed carried stays on disk forever.
	for row in mochi.db.rows("select id from posts where feed=? union select id from comments where feed=?", feed_id, feed_id) or []:
		attachment_clear(row["id"])
	mochi.db.execute("delete from comments where feed=?", feed_id)
	mochi.db.execute("delete from posts where feed=?", feed_id)
	mochi.db.execute("delete from follows where feed=?", feed_id)
	mochi.db.execute("delete from notifications where feed=?", feed_id)
	mochi.db.execute("delete from subscribers where feed=?", feed_id)
	rss_tokens_revoke(feed_id)
	mochi.db.execute("delete from feeds where id=?", feed_id)
	# The same teardown serves a removal (subscriber_drop sends it with a
	# reason), so a subscriber on an older release still purges. The reason is
	# the owner's word and decides only what the page and the notification say.
	removed = e.content("reason") == "removed"
	fingerprint = mochi.entity.fingerprint(feed_id)
	if fingerprint:
		mochi.websocket.write(fingerprint, {"type": "feed/removed" if removed else "feed/deleted", "feed": feed_id})
	# Its notifications point at rows that no longer exist.
	mochi.service.call("notifications", "delete/object", feed_id)
	if removed:
		send_notification(feed_id, "member/removed", mochi.app.label("notifications.title.removed", name=feed["name"]), mochi.app.label("notifications.body.removed"), feed_id, "/feeds/")

def event_update(e): # feeds_update_event
	feed_id = e.header("from")
	feed = mochi.db.row("select * from feeds where id=?", feed_id)
	if not feed or owned(feed_id):
		return

	# Handle name update. Validate as a name and let mochi.text.valid bound the
	# length, matching the HTTP path - a peer must not write a control-char or
	# multi-KB name into every subscriber's row (#314).
	name = e.content("name")
	if name != None:
		if mochi.text.valid(name, "name"):
			mochi.db.execute("update feeds set name=?, updated=? where id=?", name, mochi.time.now(), feed_id)
		return

	# Handle banner update, capped to the HTTP path's 10000 (#314).
	banner = e.content("banner")
	if banner != None:
		if type(banner) == "string":
			mochi.db.execute("update feeds set banner=?, updated=? where id=?", banner[:10000], mochi.time.now(), feed_id)
		return

	# Handle subscriber count update. feed_update sends the count as a number,
	# so it arrives as an int; str() it before mochi.text.valid, which accepts
	# only strings and raises on anything else. A present-but-empty field
	# coerces to "0" - the default applies only when the field is absent.
	subscribers = str(e.content("subscribers", 0) or 0)
	if not mochi.text.valid(subscribers, "natural"):
		mochi.log.info("Feed dropping update with invalid number of subscribers '%s'", subscribers)
		return

	mochi.db.execute("update feeds set subscribers=?, updated=? where id=?", int(subscribers), mochi.time.now(), feed_id)

# Handle view request from non-subscriber (stream-based request/response)
def event_view(e):
	feed_id = e.header("to")

	# Get entity info (no user restriction) - for feeds we own
	entity = mochi.entity.info(feed_id)
	if not entity or entity.get("class") != "feed":
		e.stream.write({"error": "errors.feed_not_found", "code": 404})
		return

	feed_name = entity.get("name", "")
	feed_fingerprint = entity.get("fingerprint", mochi.entity.fingerprint(feed_id))
	feed_privacy = entity.get("privacy", "public")

	requester = e.header("from")
	if not check_event_access(requester, feed_id, "view"):
		e.stream.write({"error": "errors.feed_is_private", "code": 403})
		return

	# NOTE: We do NOT auto-subscribe viewers. Permissions are determined solely by
	# check_event_access which respects ACLs like "+" (Authenticated users).
	# Users must explicitly subscribe to receive updates.

	# Read optional query parameters from P2P request. Stream events carry
	# the payload via e.content() - e.data exists only on schedule events.
	post_id = e.content("post", "")
	limit = 20
	limit_str = e.content("limit", "")
	if limit_str and mochi.text.valid(str(limit_str), "natural"):
		limit = min(int(limit_str), 100)
	before_str = e.content("before", "")
	before = None
	if before_str and decimal(str(before_str)):
		before = int(before_str)

	# Get posts for this feed
	if post_id:
		posts = mochi.db.rows("select * from posts where id=? and feed=?", post_id, feed_id)
	elif before:
		posts = mochi.db.rows("select * from posts where feed=? and created<? order by created desc limit ?", feed_id, before, limit + 1)
	else:
		posts = mochi.db.rows("select * from posts where feed=? order by created desc limit ?", feed_id, limit + 1)

	has_more = not post_id and len(posts) > limit
	if has_more:
		posts = posts[:limit]

	# Format posts with comments and reactions
	formatted_posts = []
	for post in posts:
		post_data = dict(post)
		post_data["feed_fingerprint"] = feed_fingerprint
		post_data["feed_name"] = feed_name
		if post.get("format", "markdown") == "markdown":
			post_data["body_markdown"] = mochi.text.markdown(post["body"])
		post_data["attachments"] = post_attachments(post["id"], feed_id)
		# Decode JSON data field
		if post_data.get("data"):
			post_data["data"] = json.decode(post_data["data"], None) or {}
		else:
			post_data["data"] = {}
		post_data["my_reaction"] = ""
		post_data["reactions"] = mochi.db.rows("select * from reactions where post=? and comment='' and reaction!=''", post["id"])
		# None, not e.user: on a stream event e.user is the recipient (this feed's
		# owner), and feed_comments treats its argument as the viewer - stamping
		# comment["user"], my_reaction and the reaction filter with it. A remote
		# viewer has no local reaction state.
		post_data["comments"] = feed_comments(None, post_data, None, 0)
		# Raw tags only: a remote viewer's interests live on their own host, so
		# enriching here would colour their tags by this owner's interests.
		# action_view enriches for local viewers.
		post_data["tags"] = mochi.db.rows("select id, label, qid, source, relevance from tags where object=?", post["id"]) or []
		# Add source attribution
		source_post = mochi.db.row("select s.name, s.url, s.type from source_posts sp join sources s on sp.source = s.id where sp.post=?", post["id"])
		if source_post:
			post_data["source"] = {"name": source_post["name"], "url": source_post["url"], "type": source_post["type"]}
		elif post_data["data"].get("rss", {}).get("source"):
			rss = post_data["data"]["rss"]
			post_data["source"] = {"name": rss["source"], "url": rss.get("link", ""), "type": "rss"}
		post_data["copies"] = copies_present(post["id"])
		formatted_posts.append(post_data)

	# Calculate permissions for the requester
	permissions = {
		"view": True,
		"react": check_event_access(requester, feed_id, "react"),
		"comment": check_event_access(requester, feed_id, "comment"),
		"manage": False,  # Remote users cannot manage
	}

	next_cursor = None
	if has_more and len(formatted_posts) > 0:
		next_cursor = formatted_posts[-1]["created"]

	# Get banner for remote viewers
	feed_row = mochi.db.row("select banner from feeds where id=?", feed_id)
	banner = feed_row["banner"] if feed_row else ""
	banner_html = mochi.text.markdown(banner) if banner else ""

	subscribers = mochi.db.row("select subscribers from feeds where id=?", feed_id)
	e.stream.write({
		"name": feed_name,
		"fingerprint": feed_fingerprint,
		"privacy": feed_privacy,
		"subscribers": subscribers["subscribers"] if subscribers else 0,
		"banner": banner,
		"banner_html": banner_html,
		"posts": formatted_posts,
		"permissions": permissions,
		"hasMore": has_more,
		"nextCursor": next_cursor,
	})

# Handle attachment view request (stream-based request/response)
def event_attachment_fetch(e):
	# The library runs the responder sequence (requester from the signed header,
	# authorize, bind, serve); the callbacks decide view access and that the
	# attachment belongs to this feed. `to` is routing only - for a commenter-held
	# upload it is the user's identity - so the feed comes from the requested row.
	id = e.content("id")
	feed = ""
	if attachment_identifier(id):
		row = attachment_row(id)
		if row:
			obj = mochi.db.row("select feed from posts where id=?", row["object"])
			if not obj:
				obj = mochi.db.row("select feed from comments where id=?", row["object"])
			if obj:
				feed = obj["feed"]
	feed_row = mochi.db.row("select * from feeds where id=?", feed) if feed else None

	def authorize(sender, container):
		# The feed's own entity may always fetch bytes bound to it - that is
		# the owner taking a commenter's upload in (attachment_accept / adopt).
		if sender == container:
			return True
		# Access is grants plus subscription, never the feed's privacy field -
		# that decides directory publication only. A public feed carries the
		# wildcard view grant creation writes, so it passes this same check.
		return check_event_access(sender, container, "view")

	def bound(obj):
		if mochi.db.exists("select 1 from posts where id=? and feed=?", obj, feed):
			return True
		return mochi.db.exists("select 1 from comments where id=? and feed=?", obj, feed)

	attachment_respond(e, feed, authorize, member=bound)

# Handle comment add request (stream-based request/response)
def event_comment_add(e):
	user_id = e.user.identity.id if e.user and e.user.identity else None
	feed_id = e.header("to")
	commenter_id = e.header("from")

	# Get feed data
	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		e.stream.write({"error": "errors.feed_not_found"})
		return

	# Check if commenter has permission to comment
	if not check_event_access(commenter_id, feed_id, "comment"):
		e.stream.write({"error": "errors.not_allowed_comment"})
		return

	# Validate post exists
	post_id = e.content("post")
	if not mochi.db.exists("select id from posts where id=? and feed=?", post_id, feed_id):
		e.stream.write({"error": "errors.post_not_found"})
		return

	# Validate parent if provided. Scope to the feed: an unscoped lookup let a
	# caller pass a parent from another feed and, via the post_id reassignment
	# below, inject a comment into that feed's thread (feed_comments renders by
	# post/parent, not feed).
	parent_id = e.content("parent") or ""
	if parent_id:
		parent = mochi.db.row("select * from comments where id=? and feed=?", parent_id, feed_id)
		if not parent:
			e.stream.write({"error": "errors.parent_not_found"})
			return
		# Ensure we reply to the correct post thread - trust the parent's post ID
		post_id = parent["post"]

	# Validate body
	body = e.content("body")
	if not mochi.text.valid(body, "text"):
		e.stream.write({"error": "errors.invalid_body"})
		return

	# Validate commenter name
	name = e.content("name")
	if not mochi.text.valid(name, "name"):
		e.stream.write({"error": "errors.invalid_name"})
		return

	# Preserve the caller-generated ID when provided so optimistic UI state stays in sync.
	input_id = e.content("id")
	uid = input_id if input_id and mochi.text.valid(input_id, "line") else mochi.uid()
	if mochi.db.exists("select id from comments where id=?", uid):
		e.stream.write({"error": "errors.duplicate_id"})
		return

	now = mochi.time.now()

	# The commenter's anchor is a claim; bound to the post's own attachments.
	anchor = comment_anchor(post_id, feed_id, e.content("attachment"))

	# Store the comment
	mochi.db.execute("insert into comments (id, feed, post, parent, subscriber, name, body, created, attachment) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		uid, feed_id, post_id, parent_id, commenter_id, name, body, now, anchor)
	mochi.db.commit.fire("comments", "insert", uid)

	# Store the request's attachment metadata and take the bytes in from the
	# commenter now, while it is online; a pull that fails heals on serve.
	attachments = e.content("attachments") or []
	if attachments:
		attachment_accept(attachments, commenter_id, uid, feed_id)
	copies = replies_store(uid, e.content("copies"))

	set_post_updated(post_id)
	set_feed_updated(feed_id)

	# comment/create WebSocket notification is fired by the commit hook above
	# (see mochi.db.commit.fire / on_db_commit at the top of this file).

	# Raise the owner's own notification here: the fan-out below reaches the
	# owner's copy too, but finds the comment already written and stops.
	notify_comment(feed_id, e.user.identity.id, {"id": uid, "post": post_id, "parent": parent_id,
		"subscriber": commenter_id, "name": name, "body": body})

	# Fan out to the other subscribers through the durable broadcast log, the
	# same event the owner's own comment path emits. Nothing else carries it:
	# the websocket reaches only browsers on this server, and a replica resyncs
	# only when it notices a gap. broadcast_event sends from the feed
	# entity, which this handler's user owns, as event_tag_add_submit does.
	comment_event = {"id": uid, "post": post_id, "parent": parent_id, "created": now,
		"subscriber": commenter_id, "name": name, "body": body, "attachment": anchor}
	if attachments:
		comment_event["attachments"] = attachments
	if copies:
		comment_event["copies"] = copies
	broadcast_event(feed_id, "comment/create", comment_event, commenter_id)
	if body:
		notify_mentions(feed_id, post_id, body, commenter_id, name, uid)

	e.stream.write({"id": uid})

# Handle post reaction add request (stream-based request/response)
def opengraph_feed(params):
	feed_id = params.get("feed", "")
	post_id = params.get("post", "")

	# Default values. Resolved via mochi.app.label() so anonymous viewers
	# (crawlers, link previews, etc.) get a localised string per their
	# Accept-Language header — see Phase 1 Wave 4 step 20 in claude/plans/languages.md.
	og = {
		"title": mochi.app.label("opengraph.fallback.title"),
		"description": mochi.app.label("opengraph.fallback.description"),
		"type": "website"
	}

	# Look up feed by ID or fingerprint
	feed = None
	if feed_id:
		feed = mochi.db.row("select * from feeds where id=?", feed_id)
		if not feed:
			feed = mochi.db.row("select * from feeds where fingerprint=?", feed_id)

	if feed:
		# OpenGraph is rendered for anonymous crawlers / link previews in the
		# owner's DB context with no caller identity, so treat every request as
		# untrusted and ask the access rules directly - never the privacy field,
		# which decides directory publication only. A feed that grants "*" view
		# at creation passes; anything else emits no name or post content. A
		# logged-in viewer still gets the real page through the SPA.
		if not check_event_access(None, feed["id"], "view"):
			return og

		og["title"] = feed["name"]
		og["description"] = mochi.app.label("opengraph.feed.description", name=feed["name"])

		# If specific post requested, use post content
		if post_id:
			# Bind the post to the route feed so a post from another feed (e.g. a
			# private or subscribed feed in the owner's DB) can't be named.
			post = mochi.db.row("select * from posts where id=? and feed=?", post_id, feed["id"])
			# A post for followers alone is shown to nobody here: this page
			# is for strangers.
			if post and post.get("visibility", "public") == "followers":
				post = None
			if post:
				og["type"] = "article"
				webmention_page(og, feed, post)
				# Use first 200 chars of post body as description
				body = post["body"]
				if len(body) > 200:
					body = body[:197] + "..."
				og["description"] = body
				og["title"] = mochi.app.label("opengraph.post.title", name=feed["name"])

				# Check for image attachment
				attachments = attachment_list(post_id)
				for att in attachments:
					if att.get("type", "").startswith("image/"):
						og["image"] = "-/attachments/" + att["id"]
						break
		else:
			# No specific post - check most recent post for image
			recent = mochi.db.row("select id from posts where feed=? order by created desc limit 1", feed["id"])
			if recent:
				attachments = attachment_list(recent["id"])
				for att in attachments:
					if att.get("type", "").startswith("image/"):
						og["image"] = "-/attachments/" + att["id"]
						break

	return og

# CROSS-APP PROXY ACTIONS

# Proxy user search to people app
def action_users_search(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	query = a.input("search", "")
	results = mochi.service.call("people", "users/search", query)
	return {"data": {"results": results}}

# Proxy groups list to people app
def action_groups(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	groups = mochi.service.call("friends", "groups/list")
	return {"data": {"groups": groups}}

# SOURCES

# List sources for a feed (owner only)
def action_sources_list(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id

	feed = get_feed(a)
	if not feed:
		a.error.label(404, "errors.feed_not_found")
		return

	if not is_feed_owner(user_id, feed):
		a.error.label(403, "errors.access_denied")
		return

	sources = mochi.db.rows("select * from sources where feed=?", feed["id"])
	# A source following a person through a hosted account says how the
	# follow stands (phase 17).
	for source in sources:
		if source["type"] == "person/posts" and source.get("account"):
			source["state"] = source_state(source)
	return {"data": {"sources": sources}}

# Edit a source (owner only)
def action_sources_edit(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id

	feed = get_feed(a)
	if not feed:
		a.error.label(404, "errors.feed_not_found")
		return

	if not is_feed_owner(user_id, feed):
		a.error.label(403, "errors.access_denied")
		return

	source_id = a.input("source")
	source = mochi.db.row("select * from sources where id=? and feed=?", source_id, feed["id"])
	if not source:
		a.error.label(404, "errors.source_not_found")
		return

	name = a.input("name")
	credibility = a.input("credibility")

	if name != None:
		if not mochi.text.valid(name, "line"):
			a.error.label(400, "errors.invalid_name")
			return
		mochi.db.execute("update sources set name=? where id=?", name, source_id)

	if credibility != None:
		if not decimal(credibility):
			a.error.label(400, "errors.credibility_range")
			return
		cred = int(credibility)
		if cred < 0 or cred > 100:
			a.error.label(400, "errors.credibility_range")
			return
		mochi.db.execute("update sources set credibility=? where id=?", cred, source_id)
		post_rows = mochi.db.rows("select post from source_posts where source=?", source_id) or []
		post_ids = [r["post"] for r in post_rows]
		if post_ids:
			for batch in chunks(post_ids, BATCH):
				placeholders = ", ".join(["?" for _ in batch])
				mochi.db.execute("update posts set credibility=? where id in (" + placeholders + ")", cred, *batch)
			# Credibility multiplies the interest score, so rescore the affected posts
			# now; deleting the score rows instead leaves them at 0 until an unrelated
			# rescore.
			score_posts_for_viewer(post_ids, user_id)
			broadcast_event(feed["id"], "post/credibility", {"posts": post_ids, "credibility": cred})
		mochi.db.execute("delete from score_cache where feed=?", feed["id"])

	transform = a.input("transform")
	if transform != None:
		if len(transform) > 2000:
			a.error.label(400, "errors.transform_too_long")
			return
		mochi.db.execute("update sources set transform=? where id=?", transform, source_id)

	return {"data": {"ok": True}}

# Add a source to a feed (owner only)
def action_sources_add(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id

	feed = get_feed(a)
	if not feed:
		a.error.label(404, "errors.feed_not_found")
		return
	feed_id = feed["id"]

	if not is_feed_owner(user_id, feed):
		a.error.label(403, "errors.access_denied")
		return

	source_type = a.input("type")
	url = a.input("url")
	name = a.input("name")

	if source_type == "feed/memories":
		return sources_add_memories(a, feed, name)

	if not source_type or not url:
		a.error.label(400, "errors.type_and_url_required")
		return

	if source_type == "rss":
		return sources_add_rss(a, feed, url, name)
	elif source_type == "feed/posts":
		return sources_add_feed(a, feed, url, name)
	elif source_type in ACCOUNT_SOURCE_TYPES:
		return sources_add_account(a, feed, source_type, url, name)
	elif source_type == "person":
		return sources_add_person(a, feed, url, name)
	elif source_type == "tag":
		return sources_add_tag(a, feed, url, name)
	elif source_type == "bluesky":
		return sources_add_bluesky(a, feed, url, name)
	else:
		a.error.label(400, "errors.invalid_source_type")
		return

# Add an RSS source. A caller that has fetched the document already, to choose
# this address among several, passes its result.
def sources_add_rss(a, feed, url, name, result=None):
	feed_id = feed["id"]

	# Validate URL format
	if not url.startswith("http://") and not url.startswith("https://"):
		a.error.label(400, "errors.url_scheme_required")
		return

	# Check for duplicate URL
	if mochi.db.exists("select 1 from sources where feed=? and url=?", feed_id, url):
		a.error.label(400, "errors.source_exists")
		return

	# Fetch the RSS feed to validate and get initial items
	if result == None:
		result = mochi.rss.fetch(url, {})
	status = result["status"]

	if status == 0:
		a.error.label(502, "errors.unable_to_fetch_feed")
		return
	if status < 200 or status >= 300:
		a.error.label(502, "errors.feed_returned_status", status=status)
		return

	# Use feed title as name if not provided
	if not name:
		name = strip_title(result.get("title", ""))
	if not name:
		name = url

	# AI credibility suggestion
	suggested_credibility = None
	credibility = 100
	link = result.get("link", "")
	domain = ""
	if link:
		# Extract domain from feed link
		parts = link.split("//", 1)
		if len(parts) > 1:
			domain = parts[1].split("/", 1)[0]
	if not domain:
		# Fall back to URL
		parts = url.split("//", 1)
		if len(parts) > 1:
			domain = parts[1].split("/", 1)[0]

	ai_prompt = get_user_ai_prompt(a, "credibility").replace("{{source}}", name).replace("{{domain}}", domain)
	ai_result = mochi.ai.prompt(ai_prompt, account=resolve_ai_account(0))
	if ai_result and ai_result.get("status") == 200:
		ai_text = ai_result.get("text", "").strip()
		if decimal(ai_text):
			score = int(ai_text)
			if score >= 0 and score <= 100:
				credibility = score
				suggested_credibility = score

	source, count = rss_source_create(feed_id, url, name, result, a.user.identity.id if a.user else None, credibility)
	response = {"source": source, "ingested": count}
	if suggested_credibility != None:
		response["suggested_credibility"] = suggested_credibility
	return {"data": response}

# The RSS source row from a fetched document, with the document's items as the
# source's history and its polls booked. Answers (source, ingested).
def rss_source_create(feed_id, url, name, result, user_id, credibility=100):
	source_id = mochi.uid()
	now = mochi.time.now()
	ttl = result.get("ttl", 0)
	etag = result.get("headers", {}).get("etag", "")
	modified = result.get("headers", {}).get("last-modified", "")
	base = 300  # 5 minutes default
	max_interval = 86400  # 24 hours

	mochi.db.execute("insert into sources (id, feed, type, url, name, credibility, base, max, interval, next, jitter, changed, etag, modified, ttl, fetched) values (?, ?, 'rss', ?, ?, ?, ?, ?, ?, ?, 60, ?, ?, ?, ?, ?)",
		source_id, feed_id, url, name, credibility, base, max_interval, base, now + base + 60, now, etag, modified, ttl, now)

	# Ingest initial items. notify=False: this backfills the source's
	# history for a user who is adding the source right now - it isn't news.
	items = result.get("items", [])
	count, _ = ingest_rss_items(source_id, feed_id, items, user_id, notify=False)

	# Schedule next poll
	mochi.schedule.after("schedule_sources_poll", {"feed": feed_id}, base)

	# Ensure daily watchdog is running
	ensure_sources_watchdog()

	source = mochi.db.row("select * from sources where id=?", source_id)
	websub_follow(source, result)
	return (source, count)

# Add a Mochi feed source
def sources_add_feed(a, feed, source_feed_id, name):
	feed_id = feed["id"]

	if not mochi.text.valid(source_feed_id, "entity") and not mochi.text.valid(source_feed_id, "fingerprint"):
		a.error.label(400, "errors.invalid_feed_id")
		return

	# Resolve fingerprint to entity ID
	resolved_id = resolve_feed_id(source_feed_id)
	if not resolved_id:
		a.error.label(404, "errors.source_feed_not_found")
		return

	# Can't add self as source
	if resolved_id == feed_id:
		a.error.label(400, "errors.cannot_add_own_feed")
		return

	# Check for duplicate
	if mochi.db.exists("select 1 from sources where feed=? and url=?", feed_id, resolved_id):
		a.error.label(400, "errors.source_exists")
		return

	# Subscribe to the source feed via the existing mechanism
	server = a.input("server")

	# Get feed info from directory if no server
	schema = None
	feed_name = name
	if server:
		peer = mochi.remote.peer(server)
		if not peer:
			a.error.label(502, "errors.unable_to_connect")
			return
		response = mochi.remote.request(resolved_id, "feeds", "info", {"feed": resolved_id}, peer)
		if response.get("error"):
			remote_error(a, response, 404)
			return
		if not feed_name:
			feed_name = response.get("name", "")
		schema = mochi.remote.request(resolved_id, "feeds", "schema", {}, peer)
	else:
		directory = mochi.directory.get(resolved_id)
		if directory and len(directory) > 0:
			if not feed_name:
				feed_name = directory["name"]
			server = directory.get("location", "")
			if server:
				peer = mochi.remote.peer(server)
				if peer:
					schema = mochi.remote.request(resolved_id, "feeds", "schema", {}, peer)

	# For local feeds, look up the name from our database
	if not feed_name:
		local_feed = mochi.db.row("select name from feeds where id=?", resolved_id)
		if local_feed:
			feed_name = local_feed["name"]

	if not feed_name:
		feed_name = resolved_id

	# Create feed entry if it doesn't exist locally (source subscriptions tracked in sources table)
	fp = mochi.entity.fingerprint(resolved_id) or ""
	# populated=0: a source feed's posts arrive asynchronously from the owner;
	# event_sync_complete flips it to 1 when the owner's terminal signal lands.
	mochi.db.execute("insert or ignore into feeds (id, name, subscribers, updated, server, fingerprint, populated) values (?, ?, 0, ?, ?, ?, 0)",
		resolved_id, feed_name, mochi.time.now(), server or "", fp)

	# Insert schema data for immediate availability
	if schema and not schema.get("error"):
		insert_feed_schema(resolved_id, schema)

	# Send P2P subscribe message
	user_id = a.user.identity.id
	registration_send(server or "", headers(user_id, resolved_id, "subscribe"), {"name": a.user.identity.name})
	mochi.broadcast.touch(resolved_id)

	# Create source record
	source_id = mochi.uid()
	now = mochi.time.now()
	mochi.db.execute("insert into sources (id, feed, type, url, name, fetched) values (?, ?, 'feed/posts', ?, ?, ?)",
		source_id, feed_id, resolved_id, feed_name, now)

	# Copy existing posts from source feed into aggregating feed
	count = ingest_feed_posts(source_id, feed_id, resolved_id)

	source = mochi.db.row("select * from sources where id=?", source_id)
	return {"data": {"source": source, "ingested": count}}

# Add a memories source (one per feed)
def sources_add_memories(a, feed, name):
	feed_id = feed["id"]

	# Only one memories source per feed
	if mochi.db.exists("select 1 from sources where feed=? and type='feed/memories'", feed_id):
		a.error.label(400, "errors.memories_source_exists")
		return

	if not name:
		name = mochi.app.label("source.memories.name")

	source_id = mochi.uid()
	mochi.db.execute("insert into sources (id, feed, type, url, name, base, max, interval, next, jitter, fetched) values (?, ?, 'feed/memories', '', ?, 0, 0, 0, 0, 0, 0)",
		source_id, feed_id, name)

	source = mochi.db.row("select * from sources where id=?", source_id)
	return {"data": {"source": source, "ingested": 0}}

# Remove a source from a feed (owner only)
def action_sources_remove(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id

	feed = get_feed(a)
	if not feed:
		a.error.label(404, "errors.feed_not_found")
		return
	feed_id = feed["id"]

	if not is_feed_owner(user_id, feed):
		a.error.label(403, "errors.access_denied")
		return

	source_id = a.input("source")
	if not source_id:
		a.error.label(400, "errors.source_id_required")
		return

	source = mochi.db.row("select * from sources where id=? and feed=?", source_id, feed_id)
	if not source:
		a.error.label(404, "errors.source_not_found")
		return

	delete_posts = a.input("delete_posts") == "true"
	mochi.log.debug("sources_remove: source=%s delete_posts=%v raw=%v", source_id, delete_posts, a.input("delete_posts"))
	source_remove(feed, source, user_id, delete_posts)
	return {"data": {"success": True}}

# source_remove takes a source off a feed, with the posts it brought where
# asked; a person followed through a hosted account is unfollowed unless
# another feed still follows them through it, or the follow is already gone,
# as when a Bluesky app deleted its record.
def source_remove(feed, source, user_id, delete_posts, unfollow=True):
	feed_id = feed["id"]
	source_id = source["id"]

	# Delete posts before source_posts so the subqueries can find them. Bulk row
	# deletes, not a per-post loop, which timed out on a large source; attachment
	# files have no bulk clear, so those go per post.
	if delete_posts:
		post_ids = mochi.db.rows("select post from source_posts where source=?", source_id)
		mochi.log.debug("sources_remove: found %v posts to delete", len(post_ids))
		for row in post_ids:
			attachment_clear(row["post"])
		mochi.db.execute("delete from tags where object in (select post from source_posts where source=?)", source_id)
		mochi.db.execute("delete from reactions where post in (select post from source_posts where source=?)", source_id)
		mochi.db.execute("delete from comments where post in (select post from source_posts where source=?)", source_id)
		mochi.db.execute("delete from posts where id in (select post from source_posts where source=?)", source_id)
		mochi.db.execute("delete from follows where post in (select post from source_posts where source=?)", source_id)

	# Delete source_posts (FK references both sources and posts), then the source
	mochi.db.execute("delete from source_posts where source=?", source_id)
	mochi.db.execute("delete from sources where id=?", source_id)
	if web_protocols():
		mochi.websub.unsubscribe(source_id)

	# A person followed through a hosted account is unfollowed, unless another
	# feed still follows them through it (phases 17 and 19).
	if unfollow and source["type"] == "person/posts" and source.get("account"):
		acc = publish_account(source["account"])
		if acc and acc.get("hosted") and not person_followed_elsewhere(acc, source["url"], source_id):
			mochi.account.unfollow(acc["id"], source["url"])

	# For feed/posts type, clean up feed data if no longer needed
	if source["type"] == "feed/posts":
		source_feed_id = source["url"]
		# Only delete feed data if no other sources reference it and no user is subscribed
		has_other_source = mochi.db.exists("select 1 from sources where type='feed/posts' and url=?", source_feed_id)
		has_subscriber = mochi.db.exists("select 1 from subscribers where feed=?", source_feed_id)
		if not has_other_source and not has_subscriber:
			source_feed = mochi.db.row("select server from feeds where id=?", source_feed_id)
			registration_send(source_feed["server"] if source_feed else "", headers(user_id, source_feed_id, "unsubscribe"), {})
			mochi.db.execute("delete from reactions where feed=?", source_feed_id)
			mochi.db.execute("delete from comments where feed=?", source_feed_id)
			mochi.db.execute("delete from posts where feed=?", source_feed_id)
			mochi.db.execute("delete from follows where feed=?", source_feed_id)
			rss_tokens_revoke(source_feed_id)
			mochi.db.execute("delete from feeds where id=?", source_feed_id)

	# Cancel scheduled polls only if no polled sources remain on this feed
	if not mochi.db.exists("select 1 from sources where feed=? and " + POLLED_SQL, feed_id):
		scheduled = mochi.schedule.list()
		for se in scheduled:
			if se.event == "schedule_sources_poll" and se.data.get("feed") == feed_id:
				se.cancel()


# Ingest RSS items into posts and source_posts tables
# Store the new items of one fetch as posts. Returns (new posts, complete);
# complete is False when the deadline passed with items still unread.
def ingest_rss_items(source_id, feed_id, items, user_id=None, notify=True, deadline=None):
	count = 0
	new_posts = []
	complete = True
	now = mochi.time.now()
	feed_row = mochi.db.row("select ai_mode, ai_account from feeds where id=?", feed_id)
	ai_mode = feed_row["ai_mode"] if feed_row else ""
	source_row = mochi.db.row("select name, url, transform, credibility from sources where id=?", source_id)
	seen_guids = {}

	for item in items:
		# The budget is checked between items, not only between sources: an
		# item's category lookups run at one per second, so one large batch
		# can outlast the compute limit on its own. Stop here and leave the
		# rest to the follow-up run.
		if deadline != None and mochi.time.now() >= deadline:
			complete = False
			break
		guid = item.get("guid", "")
		if not guid:
			guid = item.get("link", "")
		if not guid:
			continue

		# Strip URL fragment (e.g. BBC appends #3, #4 to same article)
		if "#" in guid:
			guid = guid[:guid.index("#")]

		# Skip duplicates (within this batch and in the database)
		if guid in seen_guids:
			continue
		seen_guids[guid] = True
		if mochi.db.exists("select 1 from source_posts where source=? and guid=?", source_id, guid):
			continue

		# Format post body - strip HTML from description
		title = strip_title(item.get("title", ""))
		description_html = item.get("description", "")
		description = strip_html(description_html)
		# RSS <link> is third-party; keep only http(s) so it never renders as a
		# javascript: href downstream.
		link = safe_link(item.get("link", ""))
		parts = []
		if title:
			parts.append(title)
		if description:
			parts.append(description)
		if link:
			parts.append(link)
		body = "\n\n".join(parts)
		if not body:
			continue

		# An item whose description is only an image (xkcd, SMBC) carries its words in
		# the image's title/alt, which strip_html drops; pass that text so the
		# transform can use it.
		t_input = {"title": title, "description": description, "link": link}
		if not description:
			image_text = image_alt_text(description_html)
			if image_text:
				t_input["image_text"] = image_text
		t_action, t_fields = transform_post(source_row["transform"] if source_row else "", feed_id, t_input)
		if t_action == "drop":
			continue
		transformed = t_fields.get("title") != title or t_fields.get("description") != description or t_fields.get("link") != link
		if transformed:
			title = t_fields.get("title", title)
			description = t_fields.get("description", description)
			t_link = safe_link(t_fields.get("link", link))
			t_parts = []
			if title:
				t_parts.append(title)
			if description:
				t_parts.append(description)
			if t_link:
				t_parts.append(t_link)
			body = "\n\n".join(t_parts)
			description_html = ""
			# The link is navigation, not content: a transform that returns it
			# empty or unsafe would leave the post with no pointer to its
			# article, so the stored post keeps the item's own link.
			link = t_link or link

		# Store structured RSS data for rich rendering (og:image fetched lazily)
		image = item.get("image", "")
		rss_data = {"title": title, "link": link, "html": description_html}
		if image:
			rss_data["image"] = image
		if source_row and source_row["name"]:
			rss_data["source"] = source_row["name"]
		data = json.encode({"rss": rss_data})
		post_format = "markdown" if transformed else "text"

		# Use published timestamp or now
		created = item.get("published", 0)
		if not created or created <= 0:
			created = now

		post_id = mochi.uid()
		mmdd = compute_mmdd(created)
		source_credibility = source_row["credibility"] if source_row else 100
		mochi.db.execute("insert into posts (id, feed, body, data, format, created, updated, mmdd, credibility) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
			post_id, feed_id, body, data, post_format, created, created, mmdd, source_credibility)
		mochi.db.execute("insert into source_posts (source, post, guid) values (?, ?, ?) on conflict do nothing",
			source_id, post_id, guid)
		winner = mochi.db.row("select post from source_posts where source=? and guid=?", source_id, guid)
		if not winner or winner["post"] != post_id:
			mochi.log.debug("ingest_rss_items: lost race on (source, guid); cleaning up orphan post source=" + source_id + " guid=" + guid)
			mochi.db.execute("delete from posts where id=?", post_id)
			mochi.db.execute("delete from follows where post=?", post_id)
			continue

		# Build post event for P2P broadcast
		post_event = {"id": post_id, "created": created, "body": body, "data": {"rss": rss_data}, "credibility": source_credibility}

		# Ingest RSS categories as immediate tags (only if QID can be resolved)
		tag_list = []
		categories = item.get("categories", [])
		for cat in categories:
			cat_label = validate_tag(str(cat))
			if cat_label:
				results = mochi.qid.search(cat_label, "en")
				if not results:
					continue
				qid = results[0]["qid"]
				# Skip if this post already has a tag for this QID (different label, same entity)
				if mochi.db.exists("select 1 from tags where object=? and qid=?", post_id, qid):
					continue
				tid = mochi.uid()
				mochi.db.execute("insert or ignore into tags (id, object, label, qid, source) values (?, ?, ?, ?, 'rss')", tid, post_id, cat_label, qid)
				tag_row = mochi.db.row("select id, label, qid from tags where object=? and label=?", post_id, cat_label)
				if tag_row:
					tag_list.append({"id": tag_row["id"], "label": tag_row["label"], "qid": tag_row["qid"], "source": "rss"})

		# On to the feed's accounts, with the source's name and link; the
		# backfill when a source is added is not news and does not go out.
		if notify:
			copies = publish_sourced(feed_id, post_id, body, post_format, {"remote": guid, "name": rss_data.get("source", ""), "link": link, "network": "rss", "created": created, "transformed": transformed})
			if copies:
				post_event["copies"] = copies

		if ai_mode in ("tag", "tag+deduplicate"):
			# Defer broadcast until after AI tagging so subscribers see tagged posts
			mochi.schedule.after("schedule_ai_tag", {"feed": feed_id, "post": post_id, "broadcast": True}, 0)
		else:
			if tag_list:
				post_event["tags"] = tag_list
			broadcast_event(feed_id, "post/create", post_event, user_id)

		count = count + 1
		new_posts.append({"id": post_id, "created": created})

	if count > 0:
		set_feed_updated(feed_id)
		# Skip owner websocket when AI tagging is pending — schedule_ai_tag sends it after tagging
		if not ai_mode:
			broadcast_websocket(feed_id, {"type": "post/create", "feed": feed_id})

		# Interest scores are computed lazily at view time (action_list); precomputing
		# here would write thousands of rows per pull that most sorts never read.

		# One notification per new post, so the notifications app's roll-up counts
		# posts since the owner last read or cleared it; counting the whole unread
		# backlog re-announced old posts every poll. notify=False for a new source's
		# initial backfill.
		if notify and notification_settings(feed_id)["post"]:
			feed_data = mochi.db.row("select name, fingerprint, read from feeds where id = ?", feed_id)
			if feed_data:
				feed_read = feed_data.get("read", 0)
				feed_name = feed_data.get("name", mochi.app.label("feed.name.fallback"))
				fingerprint = feed_data.get("fingerprint", "")
				for p in new_posts:
					# Posts dated before the feed's mark-all-read are already
					# "caught up" - an RSS feed re-serving old items isn't news.
					if p["created"] > feed_read:
						send_notification(feed_id, "post", feed_name, mochi.app.label("notifications.body.new_posts", count=1), p["id"], "/feeds/" + fingerprint)

	return (count, complete)

# Copy existing posts from a source feed into the aggregating feed
def ingest_feed_posts(source_id, feed_id, source_feed_id):
	posts = mochi.db.rows("select * from posts where feed=?", source_feed_id)
	source_row = mochi.db.row("select transform from sources where id=?", source_id)
	source_transform = source_row["transform"] if source_row else ""
	count = 0
	for p in posts:
		# Skip if this post was already copied into this feed (e.g. from a previous source addition)
		if mochi.db.exists("select 1 from source_posts sp join posts pt on sp.post=pt.id where sp.guid=? and pt.feed=?", p["id"], feed_id):
			continue
		# Apply AI transform if configured
		post_body = p["body"]
		post_format = p.get("format", "markdown")
		t_action, t_fields = transform_post(source_transform, feed_id, {"body": post_body})
		if t_action == "drop":
			continue
		if t_fields.get("body") != post_body:
			post_body = t_fields["body"]
			post_format = "markdown"
		post_id = mochi.uid()
		mmdd = compute_mmdd(p["created"])
		mochi.db.execute("insert into posts (id, feed, body, data, format, created, updated, edited, up, down, mmdd, credibility) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			post_id, feed_id, post_body, clean_post_data(p.get("data", "")), post_format,
			p["created"], p["updated"], p.get("edited", 0), p.get("up", 0), p.get("down", 0), mmdd, p.get("credibility", 100))
		mochi.db.execute("insert into source_posts (source, post, guid) values (?, ?, ?) on conflict do nothing",
			source_id, post_id, p["id"])
		winner = mochi.db.row("select post from source_posts where source=? and guid=?", source_id, p["id"])
		if not winner or winner["post"] != post_id:
			mochi.log.debug("ingest_feed_posts: lost race on (source, guid); cleaning up orphan post source=" + source_id + " guid=" + p["id"])
			mochi.db.execute("delete from posts where id=?", post_id)
			mochi.db.execute("delete from follows where post=?", post_id)
			continue
		count = count + 1

	if count > 0:
		set_feed_updated(feed_id)
		broadcast_websocket(feed_id, {"type": "post/create", "feed": feed_id})

	return count

# Poll a single RSS source for new items
# Poll one RSS source. Returns (new posts, complete). complete is False when
# the run's budget ran out part way through the items: the source is then left
# untouched, so the follow-up run refetches the document and takes the rest,
# skipping the items already stored by their guid. deadline None is unbounded,
# for the manual poll.
def poll_rss_source(source, user_id=None, deadline=None):
	source_id = source["id"]
	feed_id = source["feed"]
	url = source["url"]
	now = mochi.time.now()

	# Build conditional request headers
	req_headers = {}
	if source["etag"]:
		req_headers["If-None-Match"] = source["etag"]
	if source["modified"]:
		req_headers["If-Modified-Since"] = source["modified"]

	result = mochi.rss.fetch(url, req_headers)
	status = result["status"]

	# Calculate effective base considering TTL
	effective_base = source["base"]
	if source["ttl"] > 0:
		ttl_seconds = source["ttl"] * 60
		if ttl_seconds > effective_base:
			effective_base = ttl_seconds

	new_interval = source["interval"]
	new_count = 0

	if status == 304:
		# Not modified - back off
		new_interval = min(source["interval"] * 2, source["max"])
	elif status >= 200 and status < 300:
		# Successful fetch
		items = result.get("items", [])
		new_count, complete = ingest_rss_items(source_id, feed_id, items, user_id, deadline=deadline)
		if not complete:
			return (new_count, False)

		# Update cache headers
		new_etag = result.get("headers", {}).get("etag", "")
		new_modified = result.get("headers", {}).get("last-modified", "")
		new_ttl = result.get("ttl", 0)
		mochi.db.execute("update sources set etag=?, modified=?, ttl=? where id=?",
			new_etag, new_modified, new_ttl, source_id)
		websub_follow(source, result)

		if new_count > 0:
			# New items found - reset interval
			new_interval = effective_base
			mochi.db.execute("update sources set changed=? where id=?", now, source_id)
		else:
			# No new items - back off
			new_interval = min(source["interval"] * 2, source["max"])
	else:
		# Error - back off
		new_interval = min(source["interval"] * 2, source["max"])

	# A source its hub pushes is polled at the longest interval, as a safety
	# net for pushes that never came.
	if websub_pushed(source_id):
		new_interval = source["max"]

	# Update source with new interval and next poll time
	jitter = source["jitter"]
	next_poll = now + new_interval + (mochi.time.now() % max(jitter, 1))
	mochi.db.execute("update sources set interval=?, next=?, fetched=? where id=?",
		new_interval, next_poll, now, source_id)

	return (new_count, True)

# Manual poll trigger (owner only)
def action_sources_poll(a):
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	user_id = a.user.identity.id

	feed = get_feed(a)
	if not feed:
		a.error.label(404, "errors.feed_not_found")
		return
	feed_id = feed["id"]

	if not is_feed_owner(user_id, feed):
		a.error.label(403, "errors.access_denied")
		return

	source_id = a.input("source")
	fetched = 0

	if source_id:
		# Check if it's a memories source
		mem_source = mochi.db.row("select * from sources where id=? and feed=? and type='feed/memories'", source_id, feed_id)
		if mem_source:
			check_memories(feed_id, mem_source["id"])
			return {"data": {"fetched": 0}}

		# Poll a specific polled source
		source = mochi.db.row("select * from sources where id=? and feed=? and " + POLLED_SQL, source_id, feed_id)
		if not source:
			a.error.label(404, "errors.source_not_found")
			return
		fetched, _ = poll_source(source)
	else:
		# Poll every polled source of this feed
		sources = mochi.db.rows("select * from sources where feed=? and " + POLLED_SQL, feed_id)
		for source in sources:
			count, _ = poll_source(source)
			fetched = fetched + count

	return {"data": {"fetched": fetched}}

# Seconds of the compute limit a scheduled poll may spend before it stops
# starting new work and leaves the rest to a follow-up run.
POLL_BUDGET = 50

# Seconds a run holds its feed lock. A crashed run never deletes its own, so
# the lock expires by itself, past the compute limit that cancels a runaway
# handler.
POLL_LOCK = 400

# Seconds until the safety-net poll a run books before its work, so a crash
# resumes polling instead of leaving it to the daily watchdog. It must exceed
# POLL_LOCK: a crashed run leaves its lock behind, and a safety net arriving
# while that lock is live exits without booking anything, which silences the
# feed until the watchdog.
POLL_SAFETY = 460

# Scheduled poll handler - runs via mochi.schedule
def schedule_sources_poll(e):
	if e.source != "schedule":
		return

	data = e.data
	feed_id = data.get("feed", "")
	if not feed_id:
		return
	# Acquire feed-level lock so parallel schedules exit early instead of racing.
	now = mochi.time.now()
	lock_token = mochi.uid()
	mochi.db.execute("delete from poll_locks where expires <= ?", now)
	mochi.db.execute("insert into poll_locks (feed, token, expires) values (?, ?, ?) on conflict do nothing",
		feed_id, lock_token, now + POLL_LOCK)
	lock = mochi.db.row("select token from poll_locks where feed=?", feed_id)
	if not lock or lock["token"] != lock_token:
		return

	# Schedule safety net before doing any work - if the handler crashes,
	# polling resumes once its lock has expired instead of waiting for the
	# daily watchdog.
	safety = mochi.schedule.after("schedule_sources_poll", {"feed": feed_id}, POLL_SAFETY)

	# Poll a bounded batch of due sources so the handler stays under the compute
	# limit even when many sources align on the same poll tick. The count cap
	# alone does not bound the time: each fetch may take the full 30s outbound
	# timeout, and each new item resolves its categories through Wikidata at
	# one lookup per second, so one source with twenty tagged items costs as
	# much as twenty fetches. Stop starting new fetches, and new items within
	# a fetch, once the budget is spent, leaving room for the one in flight to
	# finish, and come back in 5s for whatever is left.
	cap = 20
	deadline = now + POLL_BUDGET
	user_id = e.user.identity.id if e.user else None
	sources = mochi.db.rows("select * from sources where feed=? and " + POLLED_SQL + " and next<=? order by next limit ?", feed_id, now, cap)
	polled = 0
	complete = True
	for source in sources:
		_, complete = poll_source(source, user_id, deadline)
		polled = polled + 1
		if mochi.time.now() >= deadline:
			break

	# Replace safety net with an accurate follow-up schedule.
	safety.cancel()
	if not complete or polled < len(sources) or len(sources) >= cap:
		# Budget spent with items or sources left, or the cap was hit and more
		# are due; come back in 5s to continue draining.
		mochi.schedule.after("schedule_sources_poll", {"feed": feed_id}, 5)
	else:
		earliest = mochi.db.row("select min(next) as next from sources where feed=? and " + POLLED_SQL + " and next > ?", feed_id, now)
		if earliest and earliest["next"]:
			delay = earliest["next"] - mochi.time.now()
			if delay < 10:
				delay = 10
			mochi.schedule.after("schedule_sources_poll", {"feed": feed_id}, delay)

	mochi.db.execute("delete from poll_locks where feed=? and token=?", feed_id, lock_token)

# Ensure a poll is scheduled for this feed
def ensure_feed_poll(feed_id):
	if not mochi.db.exists("select 1 from sources where feed=? and " + POLLED_SQL, feed_id):
		return
	scheduled = mochi.schedule.list()
	for se in scheduled:
		if se.event == "schedule_sources_poll" and se.data.get("feed", "") == feed_id:
			return
	earliest = mochi.db.row("select min(next) as next from sources where feed=? and " + POLLED_SQL, feed_id)
	if earliest and earliest["next"]:
		delay = earliest["next"] - mochi.time.now()
		if delay < 10:
			delay = 10
		mochi.schedule.after("schedule_sources_poll", {"feed": feed_id}, delay)

# Ensure the daily watchdog is scheduled
def ensure_sources_watchdog():
	scheduled = mochi.schedule.list()
	for se in scheduled:
		if se.event == "schedule_sources_watchdog":
			return
	mochi.schedule.every("schedule_sources_watchdog", {}, 86400)

# Ensure a poll is scheduled for every feed with RSS sources, and the daily
# watchdog with them. One schedule listing covers all of them, so the app's
# class-level info load can afford it: a user with no RSS sources costs one
# query, and a user whose schedule rows were lost gets them back on the next
# open rather than on a visit to each feed.
def ensure_polls():
	ensure_account_jobs()
	feeds = mochi.db.rows("select distinct feed from sources where " + POLLED_SQL)
	if not feeds:
		return
	polled = {}
	watchdog = False
	for se in mochi.schedule.list():
		if se.event == "schedule_sources_poll":
			feed_id = se.data.get("feed", "")
			if feed_id:
				polled[feed_id] = True
		elif se.event == "schedule_sources_watchdog":
			watchdog = True
	now = mochi.time.now()
	for feed in feeds:
		feed_id = feed["feed"]
		if feed_id in polled:
			continue
		earliest = mochi.db.row("select min(next) as next from sources where feed=? and type='rss'", feed_id)
		if earliest and earliest["next"]:
			delay = earliest["next"] - now
			if delay < 10:
				delay = 10
			mochi.schedule.after("schedule_sources_poll", {"feed": feed_id}, delay)
	if not watchdog:
		mochi.schedule.every("schedule_sources_watchdog", {}, 86400)

# Daily watchdog - re-create any missing poll schedules
def schedule_sources_watchdog(e):
	if e.source != "schedule":
		return
	ensure_polls()

def send_notification(feed, type, title, body, item, url):
	mochi.service.call("notifications", "send",
		type, feed, title, body, url, mochi.app.label("notifications.topic." + type.replace("/", ".")),
		event=type + ":" + item)

# The per-feed notification switches and their defaults: "post" is every new
# post, on unless the user turns it off for the feed.
NOTIFICATION_DEFAULTS = {"post": True}

def notification_settings(feed_id):
	settings = dict(NOTIFICATION_DEFAULTS)
	for row in mochi.db.rows("select kind, enabled from notifications where feed=?", feed_id) or []:
		if row["kind"] in settings:
			settings[row["kind"]] = row["enabled"] == 1
	return settings

# The user's notification switches for a feed they hold.
def action_notifications(a):
	if not a.user:
		a.error.label(401, "errors.auth_required")
		return
	feed = get_feed(a)
	if not feed:
		a.error.label(404, "errors.feed_not_found")
		return
	return {"data": notification_settings(feed["id"])}

# Turn one of the user's notification switches for a feed on or off.
def action_notifications_set(a):
	if not a.user:
		a.error.label(401, "errors.auth_required")
		return
	feed = get_feed(a)
	if not feed:
		a.error.label(404, "errors.feed_not_found")
		return
	kind = a.input("kind", "")
	if kind not in NOTIFICATION_DEFAULTS:
		a.error.label(400, "errors.invalid_notification")
		return
	enabled = a.input("enabled", "")
	if enabled in ("1", "true"):
		value = 1
	elif enabled in ("0", "false"):
		value = 0
	else:
		a.error.label(400, "errors.invalid_data")
		return
	mochi.db.execute("replace into notifications ( feed, kind, enabled ) values ( ?, ?, ? )", feed["id"], kind, value)
	return {"data": notification_settings(feed["id"])}

# The link a notification about a post opens.
def post_url(feed_id, post_id):
	fingerprint = mochi.entity.fingerprint(feed_id)
	if not fingerprint:
		return "/feeds"
	return "/feeds/" + fingerprint + "/" + post_id if post_id else "/feeds/" + fingerprint

# Follow a post in a feed we hold, so every reply and reaction in it notifies.
def follow(feed_id, post_id):
	mochi.db.execute("insert or ignore into follows ( feed, post ) values ( ?, ? )", feed_id, post_id)

def followed(feed_id, post_id):
	return mochi.db.exists("select post from follows where feed=? and post=?", feed_id, post_id)

def action_post_follow(a):
	return follow_set(a, True)

def action_post_unfollow(a):
	return follow_set(a, False)

def follow_set(a, following):
	if not a.user:
		a.error.label(401, "errors.auth_required")
		return
	feed = get_feed(a)
	if not feed:
		a.error.label(404, "errors.feed_not_found")
		return
	post_id = a.input("post", "")
	if not mochi.db.exists("select id from posts where id=? and feed=?", post_id, feed["id"]):
		a.error.label(404, "errors.post_not_found")
		return
	if following:
		follow(feed["id"], post_id)
	else:
		mochi.db.execute("delete from follows where feed=? and post=?", feed["id"], post_id)
	return {"data": {"following": following}}

# mentioned is whether `body` @mentions the local user `me` by the name the
# feed's roster holds for them - the test notify_mentions sends on, so a reply
# or reaction notice need not repeat a mention the user is already told of.
def mentioned(feed_id, me, body):
	row = mochi.db.row("select name from subscribers where feed=? and id=?", feed_id, me)
	return bool(row and row["name"] and ("@[" + row["name"] + "]").lower() in (body or "").lower())

# notify_comment raises the local user's notification for a comment that has
# just arrived in a feed they hold: "comment/mine" when it answers one of their
# comments or, for the feed's owner, comments on one of their posts;
# "comment/thread" when it is in a post they follow. `me` is the local
# identity; their own comment raises nothing.
def notify_comment(feed_id, me, comment):
	if not me or comment["subscriber"] == me or mentioned(feed_id, me, comment["body"]):
		return
	if comment["parent"]:
		mine = mochi.db.exists("select id from comments where id=? and feed=? and subscriber=?", comment["parent"], feed_id, me)
	else:
		mine = owned(feed_id)
	if mine:
		kind = "comment/mine"
	elif followed(feed_id, comment["post"]):
		kind = "comment/thread"
	else:
		return
	excerpt = comment["body"][:50] + "..." if len(comment["body"]) > 50 else comment["body"]
	send_notification(feed_id, kind,
		mochi.app.label("notifications.title.new_comment"),
		mochi.app.label("notifications.body.commented", name=comment["name"], excerpt=excerpt),
		comment["id"], post_url(feed_id, comment["post"]))

# notify_reaction is notify_comment for a reaction to a post, or to `comment`
# on it: "reaction/mine" when it is to one of the user's own, "reaction/thread"
# when it is in a post they follow. A removed reaction raises nothing.
def notify_reaction(feed_id, me, post_id, comment, reactor, name, reaction):
	if not me or not reaction or reactor == me:
		return
	if comment:
		mine = mochi.db.exists("select id from comments where id=? and feed=? and subscriber=?", comment, feed_id, me)
		body = "notifications.body.reacted_to_your_comment" if mine else "notifications.body.reacted_to_comment"
	else:
		mine = owned(feed_id)
		body = "notifications.body.reacted_to_your_post" if mine else "notifications.body.reacted_to_post"
	if mine:
		kind = "reaction/mine"
	elif followed(feed_id, post_id):
		kind = "reaction/thread"
	else:
		return
	send_notification(feed_id, kind,
		mochi.app.label("notifications.title.new_reaction"),
		mochi.app.label(body, name=name, reaction=reaction),
		(comment or post_id) + ":" + reactor + ":" + reaction, post_url(feed_id, post_id))

def action_notifications_clear(a):
	"""Clear notifications for a specific feed."""
	if not a.user:
		a.error.label(401, "errors.auth_required")
		return
	user_id = a.user.identity.id
	feed = get_feed(a)
	if feed:
		if not is_feed_owner(user_id, feed) and not is_user_subscribed(user_id, feed["id"]):
			a.error.label(403, "errors.access_denied")
			return
		mochi.service.call("notifications", "clear/object", feed["id"])

def action_sort_set_default(a):
	"""Set the user's default post sort (applied to All feeds and to feeds with no override)."""
	if not a.user:
		a.error.label(401, "errors.auth_required")
		return
	sort = a.input("sort", "")
	if sort not in VALID_SORTS:
		a.error.label(400, "errors.invalid_sort")
		return
	mochi.db.execute("update settings set sort=? where id=1", sort)
	return {"data": {"sort": sort}}

def action_sort_set_feed(a):
	"""Set the post sort for a specific feed (empty string clears the override)."""
	if not a.user:
		a.error.label(401, "errors.auth_required")
		return
	feed = get_feed(a)
	if not feed:
		a.error.label(404, "errors.feed_not_found")
		return
	user_id = a.user.identity.id
	if not is_feed_owner(user_id, feed) and not is_user_subscribed(user_id, feed["id"]):
		a.error.label(403, "errors.access_denied")
		return
	sort = a.input("sort", "")
	if sort not in VALID_SORTS:
		a.error.label(400, "errors.invalid_sort")
		return
	mochi.db.execute("update feeds set sort=? where id=?", sort, feed["id"])
	return {"data": {"sort": sort}}

# RSS

# Escape special XML characters
def escape_xml(s):
	if not s:
		return ""
	s = s.replace("&", "&amp;")
	s = s.replace("<", "&lt;")
	s = s.replace(">", "&gt;")
	s = s.replace('"', "&quot;")
	s = s.replace("'", "&apos;")
	return s

# Get or create an RSS token for an entity+mode combination
def action_rss_token(a):
	if not a.user:
		a.error.label(401, "errors.auth_required")
		return

	entity = a.input("entity")
	mode = a.input("mode")
	if not entity or not mode:
		a.error.label(400, "errors.missing_entity_or_mode")
		return
	if mode != "posts" and mode != "all":
		a.error.label(400, "errors.invalid_mode")
		return

	user_id = a.user.identity.id

	if entity == "*":
		feed_id = "*"
	else:
		feed_data = feed_by_id(user_id, entity)
		if not feed_data:
			a.error.label(404, "errors.feed_not_found")
			return
		feed_id = feed_data["id"]

	# Check existing token
	existing = mochi.db.row("select token from rss where entity=? and mode=?", feed_id, mode)
	if existing:
		return {"data": {"token": existing["token"]}}

	# Create new token, bound to the feed action and this feed alone. A feed
	# URL is shared casually and lives in reader histories and proxy logs, so
	# it must not also authorise the app's other actions.
	if feed_id == "*":
		token = mochi.token.create("rss", ["rss"], 0, "rss", "")
	else:
		# Bound to the fingerprint, not the id: a subscriber's server holds no
		# entity row for a feed it did not create, so the only identifier it
		# can compare is the one in the URL - which is the fingerprint the feed
		# URL is built from. Core accepts either identifier for an entity it
		# does host, so an owner's existing token keeps working.
		token = mochi.token.create("rss", ["rss"], 0, ":feed/rss", feed_data["fingerprint"] if feed_data.get("fingerprint") else mochi.entity.fingerprint(feed_id))
	if not token:
		a.error.label(500, "errors.failed_create_token")
		return

	now = mochi.time.now()
	mochi.db.execute("insert into rss (token, entity, mode, created) values (?, ?, ?, ?)", token, feed_id, mode, now)
	return {"data": {"token": token}}

# Revoke a feed's RSS access: delete the core token(s) and rss row(s) so the RSS
# URL stops working. The next Copy RSS URL mints a fresh token.
def action_rss_token_revoke(a):
	if not a.user:
		a.error.label(401, "errors.auth_required")
		return

	entity = a.input("entity")
	if not entity:
		a.error.label(400, "errors.missing_entity_or_mode")
		return

	if entity == "*":
		feed_id = "*"
	else:
		feed_data = feed_by_id(a.user.identity.id, entity)
		if not feed_data:
			a.error.label(404, "errors.feed_not_found")
			return
		feed_id = feed_data["id"]

	rss_tokens_revoke(feed_id)
	return {"data": {"ok": True}}

# Serve RSS feed for all subscribed feeds
def action_rss_all(a):
	if not a.user:
		a.error.label(401, "errors.auth_required")
		return

	# Look up mode from token
	token = a.input("token")
	mode = "posts"
	if token:
		rss_row = mochi.db.row("select mode from rss where token=? and entity='*'", token)
		if not rss_row:
			# A token that matches no row is refused rather than ignored, so this
			# path and action_rss agree on what an unrecognised token means.
			a.error.label(403, "errors.not_allowed")
			return
		mode = rss_row["mode"]

	topic, hub = rss_topic(token, "/feeds/rss")
	if hub:
		a.header("Link", "<" + hub + '>; rel="hub", <' + topic + '>; rel="self"')
	a.header("Content-Type", "application/rss+xml; charset=utf-8")
	a.print(rss_all_document(a.user.identity.id, mode, a.origin, topic, hub))

def rss_all_document(user_id, mode, origin, topic="", hub=""):
	"""The all-feeds web feed: the public posts of every feed the user
	follows and, in the all mode, their comments, newest first; naming this
	server's hub where the address is one of its topics (phase 29)."""
	out = [rss_open(topic, hub)]
	out.append('<title>' + escape_xml(mochi.app.label("rss.all.title")) + '</title>\n')
	out.append('<link>' + escape_xml(origin + '/feeds') + '</link>\n')
	out.append('<description>' + escape_xml(mochi.app.label("rss.all.description")) + '</description>\n')

	# Build feed name lookup
	feed_names = {}
	all_feeds = mochi.db.rows("select id, name from feeds")
	for f in all_feeds:
		feed_names[f["id"]] = f["name"]

	# Public posts only: a web feed is read by anyone holding its address.
	if mode == "all":
		rows = mochi.db.rows("""
			select 'post' as type, p.id, p.feed, '' as author, p.body, p.created
			from posts p inner join subscribers s on p.feed = s.feed
			where s.id = ? and p.visibility='public'
			union all
			select 'comment' as type, c.id, c.feed, c.name as author, c.body, c.created
			from comments c inner join subscribers s on c.feed = s.feed inner join posts p on p.id = c.post
			where s.id = ? and p.visibility='public'
			order by created desc limit 100
		""", user_id, user_id)
	else:
		rows = mochi.db.rows("""
			select 'post' as type, p.id, p.feed, '' as author, p.body, p.created
			from posts p inner join subscribers s on p.feed = s.feed
			where s.id = ? and p.visibility='public'
			order by p.created desc limit 50
		""", user_id)

	if rows:
		out.append('<lastBuildDate>' + mochi.time.local(rows[0]["created"], "rfc822") + '</lastBuildDate>\n')

	for row in rows:
		item_id = row["id"]
		feed_id = row["feed"]
		feed_fp = mochi.entity.fingerprint(feed_id) if mochi.text.valid(feed_id, "entity") else feed_id
		item_fp = mochi.entity.fingerprint(item_id) if mochi.text.valid(item_id, "entity") else item_id
		feed_name = feed_names.get(feed_id, mochi.app.label("feed.name.fallback"))
		body = row["body"]
		if len(body) > 500:
			body = body[:500] + "..."

		if row["type"] == "comment":
			title = feed_name + ": " + mochi.app.label("rss.item.comment_by", author=row["author"])
		else:
			title = feed_name

		link = origin + "/feeds/" + feed_fp + "/" + item_fp

		out.append('<item>\n')
		out.append('<title>' + escape_xml(title) + '</title>\n')
		out.append('<link>' + escape_xml(link) + '</link>\n')
		out.append('<description>' + escape_xml(body) + '</description>\n')
		out.append('<pubDate>' + mochi.time.local(row["created"], "rfc822") + '</pubDate>\n')
		out.append('<guid isPermaLink="false">' + escape_xml(item_id) + '</guid>\n')
		if row["type"] == "post":
			item_tags = mochi.db.rows("select label from tags where object=?", item_id) or []
			for it in item_tags:
				out.append('<category>' + escape_xml(it["label"]) + '</category>\n')
		out.append('</item>\n')

	out.append('</channel>\n')
	out.append('</rss>')
	return "".join(out)

# Serve RSS feed for an entity
def action_rss(a):
	if not a.user:
		a.error.label(401, "errors.auth_required")
		return

	feed_id = a.input("feed")
	if not feed_id:
		a.error.label(400, "errors.no_feed_specified")
		return

	user_id = a.user.identity.id
	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		a.error.label(404, "errors.feed_not_found")
		return

	feed_id = feed_data["id"]
	if not check_access(a, feed_id, "view"):
		a.error.label(403, "errors.feed_is_private")
		return

	# Look up mode from token
	token = a.input("token")
	mode = "posts"
	if token:
		rss_row = mochi.db.row("select mode from rss where token=? and entity=?", token, feed_id)
		# The token authorises one feed. check_access above resolves against the
		# token's issuer, so it passes for any feed that issuer owns.
		if not rss_row:
			a.error.label(403, "errors.feed_is_private")
			return
		mode = rss_row["mode"]

	topic, hub = rss_topic(token, "/feeds/" + mochi.entity.fingerprint(feed_id) + "/rss")
	if hub:
		a.header("Link", "<" + hub + '>; rel="hub", <' + topic + '>; rel="self"')
	a.header("Content-Type", "application/rss+xml; charset=utf-8")
	a.print(rss_document(feed_data, mode, a.origin, topic, hub))

def rss_document(feed_data, mode, origin, topic="", hub=""):
	"""A feed's web feed: its public posts and, in the all mode, their
	comments, newest first; naming this server's hub where the address is
	one of its topics (phase 29)."""
	feed_id = feed_data["id"]
	feed_name = feed_data.get("name", mochi.app.label("feed.name.fallback"))
	fingerprint = mochi.entity.fingerprint(feed_id)

	out = [rss_open(topic, hub)]
	out.append('<title>' + escape_xml(feed_name) + '</title>\n')
	out.append('<link>' + escape_xml(origin + '/feeds/' + fingerprint) + '</link>\n')
	out.append('<description>' + escape_xml(mochi.app.label("rss.feed.description", name=feed_name)) + '</description>\n')

	# Public posts only: a web feed is read by anyone holding its address.
	if mode == "all":
		# Interleave posts and comments by date
		rows = mochi.db.rows("""
			select 'post' as type, id, '' as author, body, created from posts where feed=? and visibility='public'
			union all
			select 'comment' as type, id, name as author, body, created from comments where feed=? and post in (select id from posts where feed=? and visibility='public')
			order by created desc limit 100
		""", feed_id, feed_id, feed_id)
	else:
		rows = mochi.db.rows("select 'post' as type, id, '' as author, body, created from posts where feed=? and visibility='public' order by created desc limit 50", feed_id)

	if rows:
		out.append('<lastBuildDate>' + mochi.time.local(rows[0]["created"], "rfc822") + '</lastBuildDate>\n')

	for row in rows:
		item_id = row["id"]
		item_fp = mochi.entity.fingerprint(item_id) if mochi.text.valid(item_id, "entity") else item_id
		body = row["body"]
		if len(body) > 500:
			body = body[:500] + "..."

		if row["type"] == "comment":
			title = mochi.app.label("rss.item.comment_by", author=row["author"])
		else:
			title = feed_name

		link = origin + "/feeds/" + fingerprint + "/" + item_fp

		out.append('<item>\n')
		out.append('<title>' + escape_xml(title) + '</title>\n')
		out.append('<link>' + escape_xml(link) + '</link>\n')
		out.append('<description>' + escape_xml(body) + '</description>\n')
		out.append('<pubDate>' + mochi.time.local(row["created"], "rfc822") + '</pubDate>\n')
		out.append('<guid isPermaLink="false">' + escape_xml(item_id) + '</guid>\n')
		if row["type"] == "post":
			item_tags = mochi.db.rows("select label from tags where object=?", item_id) or []
			for it in item_tags:
				out.append('<category>' + escape_xml(it["label"]) + '</category>\n')
		out.append('</item>\n')

	out.append('</channel>\n')
	out.append('</rss>')
	return "".join(out)

# ============================================================================
# Web feeds and replies from blogs (the federation plan, phase 29).
#
# WebSub: a source whose feed names a hub is subscribed there through core,
# and the hub's pushes poll it at once; its timer stays as a safety net. This
# server is also the hub of the feeds' own web feeds: each tokened address is
# a topic, announced whenever a post or comment changes what it shows.
# Webmention: a public post's page carries the post and names core's endpoint
# for the feed, so a page linking to it arrives as a comment - from anyone the
# feed does not deny (decided 2026-10-20) - and a public post tells the pages
# it links to.

RSS_TYPE = "application/rss+xml; charset=utf-8"

def web_protocols():
	"""Whether core speaks WebSub and Webmention: feeds runs on a core a
	release behind as well, which has neither."""
	return hasattr(mochi, "websub") and hasattr(mochi, "webmention")

def rss_open(topic, hub):
	"""A web feed's opening, naming this server's hub and the topic where
	the address is one."""
	out = '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n'
	if hub:
		out += '<atom:link rel="hub" href="' + escape_xml(hub) + '"/>\n<atom:link rel="self" href="' + escape_xml(topic) + '"/>\n'
	return out

def rss_topic(token, path):
	"""A tokened web feed's address as a topic of this server's hub, and the
	hub's address; both empty without a token, or where the server has no
	public address."""
	base = mochi.server.url()
	if not base or not token or not web_protocols():
		return "", ""
	topic = base + path + "?token=" + token
	hub = mochi.websub.hub(topic, token)
	if not hub:
		return "", ""
	return topic, hub

def function_websub_topic(context, key, topic):
	"""Whether a tokened web feed is still published, as the hub takes a
	subscription to it."""
	row = mochi.db.row("select entity from rss where token=?", key)
	if not row:
		return False
	return row["entity"] == "*" or mochi.db.exists("select 1 from feeds where id=?", row["entity"])

def function_websub_content(context, key, topic):
	"""A tokened web feed's document, as the hub sends it to subscribers."""
	row = mochi.db.row("select entity, mode from rss where token=?", key)
	base = mochi.server.url()
	if not row or not base:
		return None
	hub = mochi.websub.hub(topic, key)
	if row["entity"] == "*":
		identity = service_identity()
		if not identity:
			return None
		return {"content": rss_all_document(identity["id"], row["mode"], base, topic, hub), "type": RSS_TYPE}
	feed = mochi.db.row("select * from feeds where id=?", row["entity"])
	if not feed:
		return None
	return {"content": rss_document(feed, row["mode"], base, topic, hub), "type": RSS_TYPE}

def websub_announce(feed_id, table):
	"""Tell the subscribers of the web feeds a change shows in: a post's in
	the feed's and the all-feeds web feeds, a comment's in those of the all
	mode."""
	if not web_protocols():
		return
	for r in mochi.db.rows("select token, mode from rss where entity=? or entity='*'", feed_id) or []:
		if table == "comments" and r["mode"] != "all":
			continue
		mochi.websub.publish(r["token"])

def websub_follow(source, result):
	"""Subscribe a web feed source at the hub its feed names, as the address
	the feed names itself by, or let the subscription go where it names
	none."""
	if not web_protocols():
		return
	hub = result.get("hub", "")
	if hub:
		mochi.websub.subscribe(source["id"], result.get("self", "") or source["url"], hub)
	elif mochi.websub.get(source["id"]):
		mochi.websub.unsubscribe(source["id"])

def websub_pushed(source_id):
	"""Whether a hub pushes a source's changes, so its timer may run long."""
	if not web_protocols():
		return False
	held = mochi.websub.get(source_id)
	return held != None and held["state"] == "active"

def function_websub_notify(context, source):
	"""A hub's push for a source: polled now, through the feed's scheduled
	poll, which keeps one poll of a feed at a time. A source that is gone
	lets its subscription go."""
	row = mochi.db.row("select id, feed from sources where id=?", source)
	if not row:
		mochi.websub.unsubscribe(source)
		return None
	mochi.db.execute("update sources set next=? where id=?", mochi.time.now(), source)
	mochi.schedule.after("schedule_sources_poll", {"feed": row["feed"]}, 1)
	return None

def webmention_page(og, feed, post):
	"""A public post's page as servers read it: the post itself as an
	h-entry, so a page it links to can confirm the link, and the endpoint for
	mentions of it."""
	if not web_protocols():
		return
	text = post["body"]
	if post.get("format", "markdown") != "markdown":
		text = fediverse_plain(text)
	og["entry"] = {"content": mochi.text.markdown(text), "author": feed["name"], "url": post_link(feed["id"], post["id"]), "published": post["created"]}
	endpoint = mochi.webmention.endpoint(feed["id"])
	if endpoint:
		og["links"] = (og.get("links") or []) + [{"rel": "webmention", "href": endpoint}]

def webmention_send(feed, post_id, bodies, post):
	"""Tell the pages a post links to that it does, the post's page the
	source: on its creation, its edits - naming the links before and after -
	and its deletion. A post for followers alone, a post brought from a
	source, and a post in a feed no stranger may read tell nobody, as no page
	they link to could see them."""
	if not web_protocols() or not post or post.get("visibility", "public") == "followers":
		return
	if mochi.db.exists("select 1 from source_posts where post=?", post_id):
		return
	if not check_event_access(None, feed["id"], "view"):
		return
	source = post_link(feed["id"], post_id)
	if not source:
		return
	targets = []
	for body in bodies:
		for link in mochi.text.links(body or ""):
			if link not in targets:
				targets.append(link)
	if targets:
		mochi.webmention.send(source, targets)

def webmention_post(feed, target):
	"""The post of a feed's a mention names, by the last segment of its
	page's path; None for a post for followers alone."""
	path = target.split("#")[0].split("?")[0].rstrip("/")
	post_id = path.split("/")[-1] if path else ""
	if not post_id:
		return None
	post = mochi.db.row("select * from posts where id=? and feed=?", post_id, feed["id"])
	if not post or post.get("visibility", "public") == "followers":
		return None
	return post

def webmention_denied(feed_id, subject):
	"""Whether the feed denies someone, by a rule naming them."""
	for rule in (mochi.access.list.resource("feed/" + feed_id) or []):
		if rule.get("subject") == subject and not rule.get("grant"):
			return True
	return False

def function_webmention_receive(context, source, target, entity, deleted, kind="mention", author=None, content="", url="", published=0):
	"""A page's mention of a public post here, checked by core: a reply or
	a mention is a comment by the page's author, a like a reaction, and a
	repost or a bookmark is not shown. A mention sent again replaces its
	comment; one whose page is gone, or no longer links, takes it away."""
	feed = mochi.db.row("select * from feeds where id=?", entity)
	if not feed:
		return None
	post = webmention_post(feed, target)
	if not post:
		return None
	existing = mochi.db.row("select * from comments where post=? and remote=?", post["id"], source)
	if deleted:
		if existing:
			comment_delete_from_network(existing)
		if mochi.db.exists("select 1 from reactions where post=? and comment='' and subscriber=?", post["id"], source):
			reaction_from_network("post", post, source, "", "")
		return None
	if not check_event_access(None, feed["id"], "view"):
		return None
	author = author if type(author) == "dict" else {}
	actor = safe_link(str(author.get("url", "") or "")) or source
	name = str(author.get("name", "") or "")[:200] or source
	if webmention_denied(feed["id"], actor) or webmention_denied(feed["id"], source):
		return None
	if kind == "like":
		reaction_from_network("post", post, source, name, "like")
		return None
	if kind not in ("reply", "mention"):
		return None
	body = str(content or "")[:5000]
	if existing:
		if existing["body"] != body:
			comment_edit_from_network(existing, body, mochi.time.now())
		return None
	now = mochi.time.now()
	created = number(published)
	if created <= 0 or created > now:
		created = now
	comment_from_network({"id": ""}, post, "", actor, name, safe_link(str(url or "")) or source, body, "text", source, created)
	return None

# ============================================================================
# Accounts on other networks (the federation plan, phase 12).
#
# A public feed publishes to a list of the user's accounts, empty by default
# (decision 27): the linked Mastodon and Bluesky accounts, and the hosted
# fediverse (phase 15) and Bluesky (phase 18) accounts. Each post is copied to each
# account - text from markdown, cut to the network's limit with a link back,
# the attachments that fit uploaded with their descriptions and the rest left
# to the link (decision 24) - and the copy's id kept per post and account so
# edits and deletes follow (decision 25) and subscribers learn of it (decision
# 31). An account is also a source: its home timeline or its own posts, under
# the sources system, with the record of every copy published keeping a poll
# from bringing one back and a sourced post from going back to where it came
# from (decisions 30 and 32). The account's history can be imported, its
# notifications reach the bell, and a continuing archive of it is kept in the
# user's own storage.

# The networks a feed publishes to through linked accounts, and those it
# publishes to through hosted accounts (phases 15 and 18).
PUBLISH_TYPES = ["mastodon", "bluesky"]
HOSTED_TYPES = ["fediverse", "bluesky"]

# The source types an account offers, and every source type polled on a
# schedule, with the SQL fragment that selects those.
ACCOUNT_SOURCE_TYPES = ["account/timeline", "account/posts"]
# The sources a schedule fetches: a person followed through a hosted fediverse
# account (account set, the person an https id) is pushed to instead, and
# never polled (phase 17); a person on Bluesky (a did) is polled whether
# followed through an account or not, since Bluesky pushes nothing to a
# follower (phase 19), as are Bluesky custom feeds and lists.
BLUESKY_FEED_TYPES = ["generator/posts", "list/posts"]
POLLED_TYPES = ["rss", "tag/posts", "account/timeline", "account/posts", "person/posts", "generator/posts", "list/posts"]
POLLED_SQL = "(type in ('rss', 'tag/posts', 'account/timeline', 'account/posts', 'generator/posts', 'list/posts') or (type='person/posts' and (account='' or url like 'did:%')))"

# What Bluesky accepts (the constants of its lexicons): a post of 300 graphemes,
# four images of a megabyte each or one video of fifty, alternative text of a
# thousand characters.
BLUESKY_CHARACTERS = 300
BLUESKY_IMAGES = 4
BLUESKY_IMAGE_BYTES = 1000000
BLUESKY_VIDEO_BYTES = 50000000
BLUESKY_DESCRIPTION = 1000

# What a Mastodon server takes when its limits were not read at the link.
MASTODON_CHARACTERS = 500
MASTODON_ATTACHMENTS = 4
MASTODON_IMAGE_BYTES = 16000000
MASTODON_VIDEO_BYTES = 99000000
MASTODON_DESCRIPTION = 1500

# How many items one poll, import or backup step reads before it books the
# next, within the compute limit a handler has.
ACCOUNT_PAGE = 40
IMPORT_PAGES = 5

# Seconds between runs of the accounts' jobs - notifications every run, the
# backup once a day.
ACCOUNT_JOBS_INTERVAL = 300
BACKUP_INTERVAL = 86400

# === The accounts ===

def publishable(acc):
	"""Whether an account is one a feed may publish to: a linked account on a
	network that takes posts, or a hosted fediverse or Bluesky account."""
	if acc.get("hosted"):
		return acc.get("type") in HOSTED_TYPES
	return acc.get("type") in PUBLISH_TYPES

def publish_accounts():
	"""The user's accounts a feed may publish to or read from."""
	return [acc for acc in (mochi.account.list() or []) if publishable(acc)]

def publish_account(id):
	"""One such account by id, or None."""
	if not id:
		return None
	acc = mochi.account.get(id)
	if not acc or not publishable(acc):
		return None
	return acc

def hosted_fediverse(acc):
	return bool(acc.get("hosted")) and acc.get("type") == "fediverse"

def hosted_bluesky(acc):
	return bool(acc.get("hosted")) and acc.get("type") == "bluesky"

def account_present(acc):
	"""An account as the client sees it in a publish list or a picker."""
	return {"id": acc["id"], "type": acc["type"], "identifier": acc.get("identifier", ""), "name": acc.get("name") or acc.get("label") or "", "server": acc.get("server", ""), "hosted": bool(acc.get("hosted")), "url": acc.get("url", "")}

def publish_list(feed_id):
	"""The ids of the accounts a feed publishes to."""
	return [row["account"] for row in mochi.db.rows("select account from publish where feed=? order by created", feed_id)]

def publish_rows(feed_id):
	return mochi.db.rows("select account, created from publish where feed=?", feed_id)

# === The copies ===

def copy_present(row):
	return {"address": row["address"], "network": row["network"], "remote": row["remote"], "url": row.get("url", "")}

def copies_present(post_id):
	"""A post's copies on other networks, for the client and for events."""
	return [copy_present(row) for row in mochi.db.rows("select address, network, remote, url from copies where post=? order by created", post_id)]

def copies_by_posts(post_ids):
	"""{post: [copies]} for many posts in one query."""
	result = {}
	if not post_ids:
		return result
	marks = ",".join(["?" for _ in post_ids])
	for row in mochi.db.rows("select post, address, network, remote, url from copies where post in (" + marks + ") order by created", *post_ids):
		result.setdefault(row["post"], []).append(copy_present(row))
	return result

def copies_store(post_id, copies):
	"""Keep the copies a post event carries, as a subscriber (decision 31)."""
	if not listlike(copies):
		return
	mochi.db.execute("delete from copies where post=? and account=''", post_id)
	for c in copies:
		if type(c) != "dict":
			continue
		address, network, remote, url = str(c.get("address", "")), str(c.get("network", "")), str(c.get("remote", "")), safe_link(str(c.get("url", "")))
		if not address or not remote or len(address) > 500 or len(remote) > 2000:
			continue
		mochi.db.execute("insert or ignore into copies (post, account, address, network, remote, url, created) values (?, '', ?, ?, ?, ?, ?)", post_id, address, network, remote, url, mochi.time.now())

def copy_record(feed_id, post_id, acc, result):
	"""Record a copy just published and what the record of it says."""
	remote = str(result.get("id", ""))
	if not remote:
		return None
	url = str(result.get("url", "") or "")
	now = mochi.time.now()
	mochi.db.execute("insert or replace into copies (post, account, address, network, remote, url, created) values (?, ?, ?, ?, ?, ?, ?)",
		post_id, acc["id"], acc.get("identifier", ""), acc["type"], remote, url, now)
	published_record(feed_id, remote)
	return {"address": acc.get("identifier", ""), "network": acc["type"], "remote": remote, "url": url}

def published_record(feed_id, remote):
	"""Note a remote id as one of this feed's own copies, so no poll brings it
	back and nothing publishes it again (decision 30)."""
	if remote:
		mochi.db.execute("insert or ignore into published (feed, remote) values (?, ?)", feed_id, remote)

def published_has(feed_id, remotes):
	for remote in remotes:
		if remote and mochi.db.exists("select 1 from published where feed=? and remote=?", feed_id, remote):
			return True
	return False

# === Text ===

def text_codepoints(s):
	return len([c for c in s.codepoints()])

def text_cut(s, n):
	"""The first n codepoints of s."""
	if n <= 0:
		return ""
	out = []
	i = 0
	for c in s.codepoints():
		if i >= n:
			break
		out.append(c)
		i += 1
	return "".join(out)

def publish_text(body, format):
	"""A post's body as the text a network shows."""
	if format == "markdown":
		return mochi.text.plain(body)
	return body

def publish_excerpt(text, limit, link, omitted):
	"""The text within a network's limit (decision 24): whole where it fits
	and nothing was left out, else an excerpt with the link back; the link
	alone where the server has no public address to link to."""
	if text_codepoints(text) <= limit and not omitted:
		return text
	tail = ("\n\n" + link) if link else ""
	room = limit - text_codepoints(tail) - 1
	if room < 1:
		return text_cut(link, limit)
	excerpt = text_cut(text, room).rstrip()
	if text_codepoints(text) > room:
		excerpt += "…"
	return excerpt + tail

def post_link(feed_id, post_id):
	"""The absolute address of a post here, or empty where the server has none."""
	base = mochi.server.url()
	if not base:
		return ""
	return base + post_url(feed_id, post_id)

def sourced_text(source, text):
	"""A sourced post as it goes out under the user's own account: the
	source's name first (decision 30)."""
	name = source.get("name", "")
	return (name + ": " + text) if name and not text.startswith(name) else text

# === Attachments (decision 24) ===

def attachment_kind(att):
	"""image, video or '' for an attachment the networks do not take."""
	name = att.get("name", "")
	if attachment_is_image(name):
		return "image"
	if mochi.file.type(name) == "video/mp4":
		return "video"
	return ""

def attachment_bytes(att, maximum):
	"""An attachment's bytes within maximum: the file itself, or for an image
	over the limit its preview variant; None when nothing fits."""
	file = attachment_filename(att["id"], att["name"])
	size = number(att.get("size", 0))
	if size and size <= maximum:
		data = mochi.file.read(file, maximum)
		if data != None:
			return data
	if attachment_kind(att) == "image":
		variant = mochi.image.variant(file, "preview")
		if variant:
			data = mochi.cache.read(variant, maximum)
			if data != None:
				return data
	return None

def publish_media(acc, attachments, limits):
	"""Upload the attachments that fit a network's count, size and type, in
	the post's order, the kind of the first eligible one deciding where the
	network takes one kind per post. Answers (uploads, omitted)."""
	eligible = [att for att in attachments if attachment_kind(att)]
	omitted = len(eligible) < len(attachments)
	if not eligible:
		return ([], omitted)
	kind = attachment_kind(eligible[0])
	count = limits["video"] if kind == "video" else limits["images"]
	maximum = limits["video_bytes"] if kind == "video" else limits["image_bytes"]
	uploads = []
	for att in eligible:
		if attachment_kind(att) != kind or len(uploads) >= count:
			omitted = True
			continue
		data = attachment_bytes(att, maximum)
		if data == None:
			omitted = True
			continue
		description = text_cut(att.get("description") or att.get("caption") or "", limits["description"])
		upload = mochi.account.upload(acc["id"], data, mochi.file.type(att["name"]), name=att.get("name", "file"), description=description)
		if not upload or not upload.get("id"):
			omitted = True
			continue
		uploads.append({"upload": upload, "kind": kind, "description": description})
	return (uploads, omitted)

def mastodon_limits(acc):
	limits = acc.get("limits") or {}
	return {
		"characters": number(limits.get("characters")) or MASTODON_CHARACTERS,
		"images": number(limits.get("attachments")) or MASTODON_ATTACHMENTS,
		"video": 1,
		"image_bytes": number(limits.get("image")) or MASTODON_IMAGE_BYTES,
		"video_bytes": number(limits.get("video")) or MASTODON_VIDEO_BYTES,
		"description": number(limits.get("description")) or MASTODON_DESCRIPTION,
	}

BLUESKY_LIMITS = {"characters": BLUESKY_CHARACTERS, "images": BLUESKY_IMAGES, "video": 1, "image_bytes": BLUESKY_IMAGE_BYTES, "video_bytes": BLUESKY_VIDEO_BYTES, "description": BLUESKY_DESCRIPTION}

# === Publishing ===

def bluesky_facets(text):
	"""The rich text of a post record: each link, @handle and #tag in the
	text as a facet over its byte range, a mention carrying the identifier
	its handle resolves to. Byte ranges, as the network counts them."""
	facets = []
	position = 0
	for token in text.split():
		start = text.find(token, position)
		if start < 0:
			continue
		position = start + len(token)
		word = token.rstrip(".,;:!?)]}\"'")
		if not word:
			continue
		index = {"byteStart": start, "byteEnd": start + len(word)}
		if (word.startswith("https://") and len(word) > 8) or (word.startswith("http://") and len(word) > 7):
			facets.append({"index": index, "features": [{"$type": "app.bsky.richtext.facet#link", "uri": word}]})
		elif word.startswith("@") and "." in word and len(word) > 3:
			found = mochi.account.resolve(word[1:])
			if found and found.get("network") == "bluesky" and found.get("id"):
				facets.append({"index": index, "features": [{"$type": "app.bsky.richtext.facet#mention", "did": found["id"]}]})
		elif word.startswith("#") and len(word) > 1 and len(word) <= 65 and word[1:].isalnum():
			facets.append({"index": index, "features": [{"$type": "app.bsky.richtext.facet#tag", "tag": word[1:]}]})
	return facets

def publish_object(acc, text, link, attachments, source, features=None, quote=None):
	"""The object a post becomes on an account's network, in that network's
	own form (mochi.account.object.create), with the text cut and the
	attachments that fit; on Mastodon its visibility, content warning,
	sensitive flag, language and poll (phase 17); on Bluesky its links,
	mentions and hashtags as facets, its language, and the Bluesky post it
	quotes as an embedded record (phase 19)."""
	features = features or post_features({})
	limits = mastodon_limits(acc) if acc["type"] == "mastodon" else BLUESKY_LIMITS
	uploads, omitted = publish_media(acc, attachments, limits)
	if source:
		text = sourced_text(source, text)
		link = source.get("link", "") or link
	body = publish_excerpt(text, limits["characters"], link, omitted or bool(source))
	if acc["type"] == "mastodon":
		object = {"status": body, "visibility": {"followers": "private"}.get(features["visibility"], features["visibility"])}
		if uploads:
			object["media_ids"] = [u["upload"]["id"] for u in uploads]
		if features["warning"]:
			object["spoiler_text"] = features["warning"]
		if features["sensitive"]:
			object["sensitive"] = True
		if features["language"]:
			object["language"] = features["language"].split("-")[0]
		poll = features.get("poll")
		if poll and not uploads:
			expires = max(number(poll.get("expires", 0)) - mochi.time.now(), POLL_DURATION_MINIMUM)
			object["poll"] = {"options": [o["name"] for o in poll["options"]], "expires_in": expires, "multiple": bool(poll.get("multiple"))}
		return object
	object = {"$type": "app.bsky.feed.post", "text": body}
	facets = bluesky_facets(body)
	if facets:
		object["facets"] = facets
	if features["language"]:
		object["langs"] = [features["language"]]
	media = None
	if uploads:
		if uploads[0]["kind"] == "video":
			media = {"$type": "app.bsky.embed.video", "video": uploads[0]["upload"]["data"], "alt": uploads[0]["description"]}
		else:
			media = {"$type": "app.bsky.embed.images", "images": [{"image": u["upload"]["data"], "alt": u["description"]} for u in uploads]}
	quoted = None
	if type(quote) == "dict" and quote.get("network") == "bluesky" and str(quote.get("id", "")).startswith("at://") and quote.get("cid"):
		quoted = {"$type": "app.bsky.embed.record", "record": {"uri": str(quote["id"]), "cid": str(quote["cid"])}}
	if quoted and media:
		object["embed"] = {"$type": "app.bsky.embed.recordWithMedia", "record": quoted, "media": media}
	elif quoted:
		object["embed"] = quoted
	elif media:
		object["embed"] = media
	return object

def publish_announce(acc, source):
	"""A sourced post from the same network, untransformed, goes out as the
	network's own share of the original (decision 30): a boost on Mastodon, a
	repost on Bluesky. Answers {id, url} or None."""
	item = source.get("item") or {}
	if hosted_fediverse(acc):
		# An Announce of the original from the hosted account (phase 17).
		remote = str(item.get("id", "") or source.get("remote", ""))
		if not remote:
			return None
		return mochi.account.announce(acc["id"], remote)
	if acc["type"] == "mastodon":
		status = str(item.get("id", ""))
		if not status:
			return None
		answer = mochi.account.request(acc["id"], "POST", "v1/statuses/" + status + "/reblog")
		if not answer or answer.get("status", 0) < 200 or answer.get("status", 0) > 299 or type(answer.get("data")) != "dict":
			return None
		return mastodon_copy(answer["data"])
	uri, cid = item.get("uri", ""), item.get("cid", "")
	if not uri or not cid:
		return None
	return mochi.account.object.create(acc["id"], {"$type": "app.bsky.feed.repost", "subject": {"uri": uri, "cid": cid}}, key=uri + "|" + acc["id"])

def mastodon_copy(status):
	return {"id": str(status.get("id", "")), "url": str(status.get("url", "") or status.get("uri", ""))}

def publish_post(feed, post_id, body, format, attachments, accounts=None, source=None, post=None):
	"""Publish a post to the accounts given, else the feed's list; a public
	feed only (decision 27). A sourced post (source: remote, name, link,
	network, item, transformed, created) never goes back to the account it
	came from nor out again as a copy already published, and only to accounts
	added before it arrived (decision 30). A post that is not public goes to
	the networks that have a visibility (the fediverse, Mastodon) and not to
	Bluesky. Answers the copies made."""
	if feed.get("privacy", "public") != "public":
		return []
	feed_id = feed["id"]
	rows = publish_rows(feed_id)
	if accounts != None:
		rows = [{"account": a, "created": 0} for a in accounts]
	if not rows:
		return []
	if source and published_has(feed_id, [source.get("remote", "")]):
		return []
	features = post_features(post) if post else post_features({})
	quote = None
	if post:
		data = json.decode(post.get("data", "") or "{}", {})
		quote = data.get("quote") if type(data) == "dict" else None
	text = publish_text(body, format)
	link = post_link(feed_id, post_id)
	copies = []
	for row in rows:
		acc = publish_account(row["account"])
		if not acc:
			continue
		if source:
			if source.get("account") == acc["id"]:
				continue
			if number(row.get("created", 0)) > number(source.get("created", 0)):
				continue
		if features["visibility"] != "public" and acc["type"] not in ("fediverse", "mastodon"):
			continue
		if mochi.db.exists("select 1 from copies where post=? and account=?", post_id, acc["id"]):
			continue
		result = None
		if source and source.get("network") == acc["type"] and not source.get("transformed"):
			result = publish_announce(acc, source)
		if not result:
			if hosted_fediverse(acc):
				object = fediverse_note(acc, feed, post_id, body, format, link, attachments, source, features)
			else:
				object = publish_object(acc, text, link, attachments, source, features, quote)
			# A sourced post may wait for the relay's budget on a hosted
			# Bluesky account (decision 30).
			result = mochi.account.object.create(acc["id"], object, key=post_id + "|" + acc["id"], sourced=bool(source))
		if not result:
			mochi.log.warn("Feeds could not publish post %s to %s", post_id, acc.get("identifier", acc["id"]))
			continue
		copy = copy_record(feed_id, post_id, acc, result)
		if copy:
			copies.append(copy)
	if source and copies:
		published_record(feed_id, source.get("remote", ""))
	return copies

def publish_update(feed, post_id, body, format, attachments, post=None):
	"""A new version of a post reaches each copy (decision 25), copies on
	accounts since removed from the list included."""
	rows = mochi.db.rows("select account, remote from copies where post=? and account!=''", post_id)
	if not rows:
		return copies_present(post_id)
	features = post_features(post if post else (mochi.db.row("select * from posts where id=?", post_id) or {}))
	text = publish_text(body, format)
	link = post_link(feed["id"], post_id)
	for row in rows:
		acc = publish_account(row["account"])
		if not acc:
			continue
		if hosted_fediverse(acc):
			object = fediverse_note(acc, feed, post_id, body, format, link, attachments, None, features)
		else:
			object = publish_object(acc, text, link, attachments, None, features)
		result = mochi.account.object.update(acc["id"], row["remote"], object)
		if not result:
			mochi.log.warn("Feeds could not update the copy of post %s on %s", post_id, acc.get("identifier", acc["id"]))
			continue
		if result.get("id") and result["id"] != row["remote"]:
			mochi.db.execute("update copies set remote=?, url=? where post=? and account=?", str(result["id"]), str(result.get("url", "") or ""), post_id, acc["id"])
			published_record(feed["id"], str(result["id"]))
	return copies_present(post_id)

def publish_delete(post_id):
	"""Withdraw every copy of a post (decision 25). The record of their ids
	stays, so a poll never brings one back. The pages it linked to are told
	(phase 29), and its web feeds' subscribers."""
	post = mochi.db.row("select * from posts where id=?", post_id)
	feed = mochi.db.row("select * from feeds where id=?", post["feed"]) if post else None
	if feed:
		webmention_send(feed, post_id, [post["body"]], post)
		websub_announce(feed["id"], "posts")
	for row in mochi.db.rows("select account, remote from copies where post=? and account!=''", post_id):
		acc = publish_account(row["account"])
		if acc:
			mochi.account.object.delete(acc["id"], row["remote"])
	mochi.db.execute("delete from copies where post=?", post_id)

def publish_forget(feed_id, account_id):
	"""Delete the feed's copies on one account, when the user chooses to as
	the account leaves the list. Answers how many."""
	rows = mochi.db.rows("select post, remote from copies where account=? and post in (select id from posts where feed=?)", account_id, feed_id)
	acc = publish_account(account_id)
	for row in rows:
		if acc:
			mochi.account.object.delete(acc["id"], row["remote"])
		mochi.db.execute("delete from copies where post=? and account=?", row["post"], account_id)
	return len(rows)

def publish_feed_delete(feed_id):
	"""A deleted feed takes its copies with it, and the Bluesky custom feeds
	it was published as."""
	for row in mochi.db.rows("select id from posts where feed=?", feed_id):
		publish_delete(row["id"])
	for row in mochi.db.rows("select account, uri from generators where feed=?", feed_id):
		if publish_account(row["account"]):
			mochi.account.object.delete(row["account"], row["uri"])
	mochi.db.execute("delete from generators where feed=?", feed_id)
	mochi.db.execute("delete from publish where feed=?", feed_id)
	mochi.db.execute("delete from published where feed=?", feed_id)

def publish_inputs(a):
	"""The accounts a post names for itself, overriding the feed's list: a
	JSON list of ids, or None when the post leaves it to the feed. Answers
	(accounts, ok)."""
	raw = a.input("accounts")
	if raw == None or raw == "":
		return (None, True)
	decoded = json.decode(raw, None)
	if type(decoded) != "list" or len(decoded) > 20:
		return (None, False)
	accounts = []
	for id in decoded:
		if type(id) != "string" or not publish_account(id):
			return (None, False)
		if id not in accounts:
			accounts.append(id)
	return (accounts, True)

# === Actions ===

def publish_feed(a):
	"""The feed an action names, when the caller owns it, else None having
	answered."""
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return None
	feed = get_feed(a)
	if not feed:
		a.error.label(404, "errors.feed_not_found")
		return None
	if not is_feed_owner(a.user.identity.id, feed):
		a.error.label(403, "errors.access_denied")
		return None
	return feed

def action_publish_list(a):
	"""The accounts the feed may publish to and those it does."""
	feed = publish_feed(a)
	if not feed:
		return
	a.json({"accounts": [account_present(acc) for acc in publish_accounts()], "publish": publish_list(feed["id"]), "copies": publish_counts(feed["id"]), "generators": publish_generators(feed["id"])})

def publish_generators(feed_id):
	"""The generator record the feed is published as from each hosted Bluesky
	account, by account."""
	return {row["account"]: row["uri"] for row in mochi.db.rows("select account, uri from generators where feed=?", feed_id)}

def action_generator_set(a):
	"""Publish the feed as a Bluesky custom feed from one of the owner's hosted
	Bluesky accounts, or stop: a generator record naming this server, which
	Bluesky asks for the feed's posts (phase 19)."""
	feed = publish_feed(a)
	if not feed:
		return
	acc = publish_account(a.input("account", ""))
	if not acc or not hosted_bluesky(acc):
		a.error.label(404, "errors.account_not_found")
		return
	on = str(a.input("on", "")).lower() in ("true", "1", "on", "yes")
	existing = mochi.db.row("select uri from generators where feed=? and account=?", feed["id"], acc["id"])
	if on and not existing:
		if feed.get("privacy", "public") != "public":
			a.error.label(400, "errors.feed_not_public")
			return
		record = {"$type": "app.bsky.feed.generator", "displayName": text_cut(feed["name"], 24), "description": ""}
		result = mochi.account.object.create(acc["id"], record, key="generator|" + feed["id"] + "|" + acc["id"])
		if not result or not result.get("id"):
			a.error.label(502, "errors.generator_not_published")
			return
		mochi.db.execute("insert or replace into generators (feed, account, uri, created) values (?, ?, ?, ?)", feed["id"], acc["id"], str(result["id"]), mochi.time.now())
	elif not on and existing:
		mochi.account.object.delete(acc["id"], existing["uri"])
		mochi.db.execute("delete from generators where feed=? and account=?", feed["id"], acc["id"])
	a.json({"generators": publish_generators(feed["id"])})

def function_atproto_skeleton(context, account, feed, cursor, limit):
	"""The posts of a feed published as a Bluesky custom feed, newest first,
	as the records Bluesky knows them by: a post from Bluesky by its own
	record, one of the feed's own by its copy through the account (phase 19).
	The cursor is the created time of the last post answered."""
	row = mochi.db.row("select feed from generators where account=? and uri=?", account, feed)
	if not row:
		return {"posts": []}
	before = number(cursor) if cursor else 0
	limit = min(max(number(limit) or 50, 1), 100)
	sql = "select p.id, p.data, p.created, c.remote as copy from posts p left join copies c on c.post=p.id and c.account=? where p.feed=? and p.visibility!='followers'" + (" and p.created<?" if before else "") + " order by p.created desc limit ?"
	args = [account, row["feed"]] + ([before] if before else []) + [limit]
	rows = mochi.db.rows(sql, *args)
	posts = []
	for p in rows:
		record = post_record(p)
		copy = str(p.get("copy", "") or "")
		uri = record["uri"] if record else (copy if copy.startswith("at://") else "")
		if uri:
			posts.append(uri)
	out = {"posts": posts}
	if len(rows) == limit:
		out["cursor"] = str(rows[-1]["created"])
	return out

def publish_counts(feed_id):
	"""How many copies the feed holds on each account."""
	counts = {}
	for row in mochi.db.rows("select account, count(*) as n from copies where account!='' and post in (select id from posts where feed=?) group by account", feed_id):
		counts[row["account"]] = row["n"]
	return counts

def action_publish_set(a):
	"""Set the feed's publish list. The copies on an account that leaves it
	are kept, and counted in the answer so the client can offer to delete them."""
	feed = publish_feed(a)
	if not feed:
		return
	if feed.get("privacy", "public") != "public":
		a.error.label(400, "errors.feed_not_public")
		return
	accounts, ok = publish_inputs(a)
	if not ok:
		a.error.label(400, "errors.invalid_accounts")
		return
	accounts = accounts or []
	before = publish_list(feed["id"])
	now = mochi.time.now()
	for id in accounts:
		publish_add(feed["id"], id, now)
	for id in before:
		if id not in accounts:
			mochi.db.execute("delete from publish where feed=? and account=?", feed["id"], id)
	ensure_account_jobs()
	counts = publish_counts(feed["id"])
	a.json({"publish": accounts, "kept": {id: counts.get(id, 0) for id in before if id not in accounts and counts.get(id, 0)}})

def publish_add(feed_id, id, now):
	"""Put an account on a feed's publish list, with the address and page of
	a hosted one, for the follow control, which runs with no user and so
	cannot ask for the account."""
	mochi.db.execute("insert or ignore into publish (feed, account, created) values (?, ?, ?)", feed_id, id, now)
	acc = publish_account(id)
	if acc and hosted_fediverse(acc):
		mochi.db.execute("update publish set address=?, url=? where feed=? and account=?", acc.get("identifier", ""), acc.get("url", ""), feed_id, id)

def action_publish_forget(a):
	"""Delete the feed's copies on an account, as offered when it leaves the list."""
	feed = publish_feed(a)
	if not feed:
		return
	account = a.input("account", "")
	if not account:
		a.error.label(400, "errors.account_is_required")
		return
	a.json({"deleted": publish_forget(feed["id"], account)})

# === Sources ===

def account_source_name(kind, acc):
	label = "source.account.timeline" if kind == "account/timeline" else "source.account.posts"
	return mochi.app.label(label, name=acc.get("identifier", ""))

def sources_add_account(a, feed, kind, account_id, name):
	"""A linked account as a source: its home timeline or its own posts
	(decision 32). Nothing before now is read - history is imported on
	request - so the poll starts from the moment the source was added."""
	feed_id = feed["id"]
	acc = publish_account(account_id)
	if not acc:
		a.error.label(404, "errors.account_not_linked")
		return
	if mochi.db.exists("select 1 from sources where feed=? and type=? and url=?", feed_id, kind, acc["id"]):
		a.error.label(400, "errors.source_exists")
		return
	if not name:
		name = account_source_name(kind, acc)
	source_id = mochi.uid()
	now = mochi.time.now()
	base = 300
	mochi.db.execute("insert into sources (id, feed, type, url, name, credibility, base, max, interval, next, jitter, changed, fetched, since) values (?, ?, ?, ?, ?, 100, ?, 86400, ?, ?, 60, ?, ?, ?)",
		source_id, feed_id, kind, acc["id"], name, base, base, now + base + 60, now, now, now)
	mochi.schedule.after("schedule_sources_poll", {"feed": feed_id}, base)
	ensure_sources_watchdog()
	ensure_account_jobs()
	source = mochi.db.row("select * from sources where id=?", source_id)
	return {"data": {"source": source, "ingested": 0}}

def account_item(acc, item):
	"""One timeline or posts item in a network's own form as a sourced post:
	remote ids, created, text, link, image, author, and the item for an
	announce. None for an item that is not a post."""
	if type(item) != "dict":
		return None
	if acc["type"] == "fediverse":
		return fediverse_item(acc, item)
	if acc["type"] == "mastodon":
		status = item
		boosted = ""
		if type(item.get("reblog")) == "dict":
			status = item["reblog"]
			boosted = str((item.get("account") or {}).get("display_name") or (item.get("account") or {}).get("acct") or "")
		author = status.get("account") or {}
		text = strip_html(status.get("content", "") or "")
		spoiler = status.get("spoiler_text", "") or ""
		if spoiler:
			text = spoiler + "\n\n" + text
		image = ""
		for media in status.get("media_attachments") or []:
			if type(media) == "dict" and media.get("type") == "image":
				image = safe_link(str(media.get("url", "") or media.get("preview_url", "")))
				break
		return {
			"remotes": [str(status.get("id", "")), str(status.get("uri", "")), str(item.get("id", ""))],
			"guid": str(status.get("uri", "") or status.get("id", "")),
			"created": mochi.time.parse(str(status.get("created_at", ""))) or 0,
			"text": text,
			"html": str(status.get("content", "") or ""),
			"link": safe_link(str(status.get("url", "") or status.get("uri", ""))),
			"image": image,
			"author": str(author.get("display_name") or author.get("acct") or ""),
			"boosted": boosted,
			"item": {"id": str(status.get("id", ""))},
		}
	post = item.get("post") if type(item.get("post")) == "dict" else item
	record = post.get("record") or {}
	author = post.get("author") or {}
	uri = str(post.get("uri", ""))
	rkey = uri.rsplit("/", 1)[-1] if "/" in uri else ""
	handle = str(author.get("handle", "") or author.get("did", ""))
	did = str(author.get("did", "") or "")
	image = ""
	embed = post.get("embed") or {}
	images = embed.get("images") if type(embed) == "dict" else None
	if type(images) == "list" and images and type(images[0]) == "dict":
		image = safe_link(str(images[0].get("fullsize", "") or images[0].get("thumb", "")))
	reason = item.get("reason") if type(item.get("reason")) == "dict" else None
	boosted = ""
	if reason and str(reason.get("$type", "")).endswith("#reasonRepost"):
		by = reason.get("by") or {}
		boosted = str(by.get("displayName") or by.get("handle") or "")
	# The labels the labellers the account follows put on the post or its
	# author (phase 19): a label that hides it drops it, any other travels as
	# the post's content warning with the sensitive flag.
	labels = bluesky_labels(post.get("labels"), author.get("labels"))
	if labels == None:
		return None
	out = {
		"remotes": [uri],
		"guid": uri,
		"created": mochi.time.parse(str(record.get("createdAt", ""))) or 0,
		"text": str(record.get("text", "") or ""),
		"html": "",
		"link": ("https://bsky.app/profile/" + handle + "/post/" + rkey) if handle and rkey else "",
		"image": image,
		"author": str(author.get("displayName") or handle),
		"boosted": boosted,
		"item": {"uri": uri, "cid": str(post.get("cid", ""))},
		# The person's identifier and the record, for a reply, a like or a
		# boost of the post from a hosted account (phase 19).
		"actor": did if mochi.text.valid(did, "author") else "",
		"remote": uri,
		"record": {"uri": uri, "cid": str(post.get("cid", ""))},
		"warning": ", ".join(labels),
		"sensitive": bool(labels),
	}
	if type(record.get("langs")) in ("list", "tuple") and record["langs"]:
		out["language"] = str(record["langs"][0])
	return out

def bluesky_labels(post_labels, author_labels):
	"""The label values on a post and its author: None for a label that hides
	the post (the hide and takedown labels, and a labeller's negated label
	drops nothing), else the values, sorted, to show as a warning."""
	values = {}
	for labels in (post_labels, author_labels):
		if type(labels) not in ("list", "tuple"):
			continue
		for label in labels:
			if type(label) != "dict" or label.get("neg"):
				continue
			value = str(label.get("val", "") or "")
			if value in ("!hide", "!takedown", "!suspend"):
				return None
			if value and value != "!warn" and value != "!no-unauthenticated":
				values[value] = True
	return sorted(values.keys())

def poll_account_source(source, user_id=None, deadline=None):
	"""Read the newest page of an account source and make posts of what is
	new: not seen by this source, not one of the feed's own copies, not older
	than the source. Each new post goes on to the feed's accounts as a sourced
	post (decision 30). Answers (count, complete)."""
	now = mochi.time.now()
	acc = publish_account(source["url"])
	new_count = 0
	complete = True
	if acc:
		if source["type"] == "account/timeline":
			page = mochi.account.timeline(acc["id"], limit=ACCOUNT_PAGE)
		else:
			page = mochi.account.posts(acc["id"], limit=ACCOUNT_PAGE)
		feed = mochi.db.row("select * from feeds where id=?", source["feed"])
		new_count, complete = ingest_account_items(feed, source, acc, (page or {}).get("items") or [], user_id, deadline)
	source_polled(source, new_count, now)
	return (new_count, complete)

def ingest_account_items(feed, source, acc, items, user_id, deadline, notify=True):
	"""Posts of the items a source's page brought that are new: not seen by
	this source, not one of the feed's own copies, not older than the source.
	Answers (count, complete)."""
	since = number(source.get("since", 0))
	new_count = 0
	complete = True
	for raw in items:
		if deadline != None and mochi.time.now() >= deadline:
			complete = False
			break
		item = account_item(acc, raw)
		if not item or not item["guid"] or not item["text"] and not item["image"]:
			continue
		if item["created"] and item["created"] <= since:
			continue
		if mochi.db.exists("select 1 from source_posts where source=? and guid=?", source["id"], item["guid"]):
			continue
		if published_has(feed["id"], item["remotes"]):
			continue
		if sourced_post(feed, source, acc, item, user_id, notify):
			new_count += 1
	return (new_count, complete)

def source_polled(source, new_count, now):
	"""Book the source's next poll: the base interval after news, twice the
	last one up to the maximum after none."""
	new_interval = source["base"] if new_count > 0 else min(source["interval"] * 2, source["max"])
	if new_count > 0:
		mochi.db.execute("update sources set changed=? where id=?", now, source["id"])
	jitter = source["jitter"]
	next_poll = now + new_interval + (mochi.time.now() % max(jitter, 1))
	mochi.db.execute("update sources set interval=?, next=?, fetched=? where id=?", new_interval, next_poll, now, source["id"])

def sourced_post(feed, source, acc, item, user_id, notify=True):
	"""Store an account item as a post of the feed, as an RSS item is stored,
	and publish it on to the feed's other accounts; not when the item is the
	history a source brings as it is added, which is not news. Answers whether
	a post was made."""
	feed_id = feed["id"]
	text = item["text"]
	link = item["link"]
	fields = {"title": "", "description": text, "link": link}
	t_action, t_fields = transform_post(source.get("transform", ""), feed_id, fields)
	if t_action == "drop":
		return False
	transformed = t_fields.get("description") != text or t_fields.get("link") != link
	if transformed:
		text = t_fields.get("description", text)
		link = safe_link(t_fields.get("link", link)) or link
	author = item["author"]
	parts = [p for p in [text, link] if p]
	body = "\n\n".join(parts)
	if not body:
		return False
	data = {"rss": {"title": "", "link": link, "html": "" if transformed else item["html"], "source": author}}
	if item["image"]:
		data["rss"]["image"] = item["image"]
	if item["boosted"]:
		data["rss"]["shared"] = item["boosted"]
	# A post from the fediverse carries its author, who boosted it, its media,
	# its poll and its emoji (phase 17), and a quote of the post it quotes.
	for key in ["person", "boost", "media", "poll", "emoji", "record"]:
		if item.get(key):
			data[key] = item[key]
	if item.get("quote"):
		quote = sanitize_quote(mochi.url.quote(item["quote"]))
		if quote:
			data["quote"] = quote
	data = sanitize_post_data(data)
	features = {}
	if item.get("actor"):
		features = {"author": item["actor"], "remote": item.get("remote", ""), "visibility": item.get("visibility") or "public", "warning": item.get("warning", ""), "sensitive": 1 if item.get("sensitive") else 0, "language": item.get("language", "")}
	created = item["created"] or mochi.time.now()
	post_id = mochi.uid()
	mmdd = compute_mmdd(created)
	credibility = source.get("credibility", 100)
	mochi.db.execute("insert into posts (id, feed, body, data, format, created, updated, mmdd, credibility) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		post_id, feed_id, body, json.encode(data), "markdown" if transformed else "text", created, created, mmdd, credibility)
	if features:
		clause, values = features_sql(features)
		mochi.db.execute("update posts set " + clause + " where id=?", *(values + [post_id]))
	mochi.db.execute("insert into source_posts (source, post, guid) values (?, ?, ?) on conflict do nothing", source["id"], post_id, item["guid"])
	winner = mochi.db.row("select post from source_posts where source=? and guid=?", source["id"], item["guid"])
	if not winner or winner["post"] != post_id:
		mochi.db.execute("delete from posts where id=?", post_id)
		return False
	mochi.db.commit.fire("posts", "insert", post_id)
	post_event = {"id": post_id, "created": created, "body": body, "data": data, "credibility": credibility}
	post_event.update(features)
	copies = publish_post(feed, post_id, body, "text", [], None, {
		"remote": item["guid"], "name": author, "link": link, "network": acc["type"], "account": acc["id"],
		"item": item["item"], "transformed": transformed, "created": created,
	}) if notify else []
	if copies:
		post_event["copies"] = copies
	if feed.get("ai_mode", "") in ("tag", "tag+deduplicate"):
		mochi.schedule.after("schedule_ai_tag", {"feed": feed_id, "post": post_id, "broadcast": True}, 0)
	else:
		broadcast_event(feed_id, "post/create", post_event, user_id)
	set_feed_updated(feed_id)
	return True

def publish_sourced(feed_id, post_id, body, format, source):
	"""A post that arrived from any source - an RSS item, another feed's post -
	goes on to the feed's accounts (decision 30)."""
	feed = mochi.db.row("select * from feeds where id=?", feed_id)
	if not feed or not publish_rows(feed_id):
		return []
	return publish_post(feed, post_id, body, format, [], None, source)

def poll_source(source, user_id=None, deadline=None):
	"""Poll one source of any scheduled type."""
	if source["type"] in ACCOUNT_SOURCE_TYPES:
		return poll_account_source(source, user_id, deadline)
	if source["type"] in PERSON_TYPES:
		return poll_person_source(source, user_id, deadline)
	if source["type"] in BLUESKY_FEED_TYPES:
		return poll_bluesky_feed_source(source, user_id, deadline)
	return poll_rss_source(source, user_id, deadline)

# === Import ===

def action_import(a):
	"""Bring an account's history into the feed: its posts, or its bookmarks
	into the feed and into Saved. Imported posts are recorded as the feed's
	own and never published (decision 30). A long history continues in
	scheduled steps; the answer says how many this step brought and whether
	more follow."""
	feed = publish_feed(a)
	if not feed:
		return
	acc = publish_account(a.input("account", ""))
	if not acc:
		a.error.label(404, "errors.account_not_linked")
		return
	kind = a.input("kind", "")
	if kind not in IMPORT_KINDS:
		a.error.label(400, "errors.invalid_import")
		return
	count, more = import_step(feed, acc, kind, "", a.user.identity.id)
	a.json({"imported": count, "more": more})

IMPORT_KINDS = ["posts", "bookmarks", "follows"]

def import_step(feed, acc, kind, cursor, user_id):
	"""Up to IMPORT_PAGES pages of the account's posts or bookmarks into the
	feed, or a step of its follows as sources; the next step is booked when
	more remain. Answers (count, more)."""
	if kind == "follows":
		return import_follows_step(feed, acc, cursor, user_id)
	count = 0
	pages = 0
	for _ in range(IMPORT_PAGES):
		if kind == "posts":
			page = mochi.account.posts(acc["id"], cursor=cursor, limit=ACCOUNT_PAGE)
		else:
			page = import_bookmarks_page(acc, cursor)
		if not page:
			return (count, False)
		for raw in page.get("items") or []:
			item = account_item(acc, raw)
			if not item or not item["guid"] or published_has(feed["id"], item["remotes"]):
				continue
			post_id = import_post(feed, item)
			if not post_id:
				continue
			published_record(feed["id"], item["guid"])
			for remote in item["remotes"]:
				published_record(feed["id"], remote)
			if kind == "bookmarks":
				mochi.db.execute("insert or ignore into saved (id, user, post, data, created) values (?, ?, ?, ?, ?)", mochi.uid(), user_id, post_id, json.encode({"feed": feed["id"], "body": item["text"], "link": item["link"]}), mochi.time.now())
			count += 1
		cursor = page.get("cursor", "") or ""
		pages += 1
		if not cursor:
			if count:
				set_feed_updated(feed["id"])
			return (count, False)
	if count:
		set_feed_updated(feed["id"])
	mochi.schedule.after("schedule_import", {"feed": feed["id"], "account": acc["id"], "kind": kind, "cursor": cursor}, 2)
	return (count, True)

def import_bookmarks_page(acc, cursor):
	"""A page of the account's bookmarks in the network's own form."""
	if acc["type"] == "mastodon":
		query = {"limit": str(ACCOUNT_PAGE)}
		if cursor:
			query["max_id"] = cursor
		answer = mochi.account.request(acc["id"], "GET", "v1/bookmarks", query=query)
		items = answer.get("data") if answer and listlike(answer.get("data")) else []
		next = str(items[-1].get("id", "")) if items and type(items[-1]) == "dict" else ""
		return {"items": items, "cursor": next if len(items) >= ACCOUNT_PAGE else ""}
	query = {"limit": str(ACCOUNT_PAGE)}
	if cursor:
		query["cursor"] = cursor
	answer = mochi.account.request(acc["id"], "GET", "app.bsky.bookmark.getBookmarks", query=query)
	data = answer.get("data") if answer and type(answer.get("data")) == "dict" else {}
	items = []
	for bookmark in data.get("bookmarks") or []:
		if type(bookmark) == "dict" and type(bookmark.get("item")) == "dict":
			items.append({"post": bookmark["item"]})
	return {"items": items, "cursor": str(data.get("cursor", "") or "")}

def import_post(feed, item):
	"""Store an imported item as a post of the feed, dated when it was made."""
	body = "\n\n".join([p for p in [item["text"], item["link"]] if p])
	if not body:
		return None
	data = {"rss": {"title": "", "link": item["link"], "html": item["html"], "source": item["author"]}}
	if item["image"]:
		data["rss"]["image"] = item["image"]
	created = item["created"] or mochi.time.now()
	post_id = mochi.uid()
	mochi.db.execute("insert into posts (id, feed, body, data, format, created, updated, mmdd, read) values (?, ?, ?, ?, 'text', ?, ?, ?, ?)",
		post_id, feed["id"], body, json.encode(data), created, created, compute_mmdd(created), created)
	mochi.db.commit.fire("posts", "insert", post_id)
	return post_id

def schedule_import(e):
	if e.source != "schedule":
		return
	user_id = e.user.identity.id if e.user else None
	kind = e.data.get("kind", "")
	if kind == "file":
		import_file_step(e.data.get("import", ""), user_id)
		return
	feed = mochi.db.row("select * from feeds where id=?", e.data.get("feed", ""))
	acc = publish_account(e.data.get("account", ""))
	if not feed or not acc or kind not in IMPORT_KINDS:
		return
	import_step(feed, acc, kind, e.data.get("cursor", ""), user_id)

# === The accounts' jobs: notifications and backup ===

def account_cursor(account, kind):
	row = mochi.db.row("select cursor, updated from account_cursors where account=? and kind=?", account, kind)
	return (row["cursor"], row["updated"]) if row else ("", 0)

def account_cursor_set(account, kind, cursor):
	mochi.db.execute("insert or replace into account_cursors (account, kind, cursor, updated) values (?, ?, ?, ?)", account, kind, cursor, mochi.time.now())

def job_accounts():
	"""The accounts the jobs cover: those in a publish list or a source."""
	ids = {}
	for row in mochi.db.rows("select distinct account from publish"):
		ids[row["account"]] = True
	for row in mochi.db.rows("select distinct url from sources where type in ('account/timeline', 'account/posts')"):
		ids[row["url"]] = True
	# A hosted Bluesky account that follows for a feed has notifications at
	# the index to fetch (phase 19); a fediverse account's arrive at its inbox.
	for row in mochi.db.rows("select distinct account from sources where account!=''"):
		acc = publish_account(row["account"])
		if acc and hosted_bluesky(acc):
			ids[row["account"]] = True
	return [acc for acc in [publish_account(id) for id in ids] if acc]

def ensure_account_jobs():
	"""Keep the recurring job scheduled while any account is in use."""
	if not job_accounts():
		return
	for se in mochi.schedule.list():
		if se.event == "schedule_account_jobs":
			return
	mochi.schedule.every("schedule_account_jobs", {}, ACCOUNT_JOBS_INTERVAL)

def schedule_account_jobs(e):
	if e.source != "schedule":
		return
	accounts = job_accounts()
	if not accounts:
		for se in mochi.schedule.list():
			if se.event == "schedule_account_jobs":
				se.cancel()
		return
	now = mochi.time.now()
	for acc in accounts:
		notify_account(acc)
		_, backed = account_cursor(acc["id"], "backup")
		if now - backed >= BACKUP_INTERVAL:
			backup_account(acc)

def notify_account(acc):
	"""The account's notifications since the last run, to the bell."""
	cursor, _ = account_cursor(acc["id"], "notifications")
	page = mochi.account.notifications(acc["id"], limit=ACCOUNT_PAGE)
	items = (page or {}).get("items") or []
	newest = ""
	fresh = []
	for raw in items:
		if type(raw) != "dict":
			continue
		id = str(raw.get("id", "") or raw.get("uri", "") or raw.get("cid", ""))
		if not id:
			continue
		if not newest:
			newest = id
		if id == cursor:
			break
		fresh.append(raw)
	if not cursor:
		# The first run marks where it starts; what came before is history.
		fresh = []
	for raw in reversed(fresh):
		account_interaction(acc, raw)
		notification = account_notification(acc, raw)
		if notification:
			mochi.service.call("notifications", "send", "account", acc["id"], notification["title"], notification["body"], notification["url"],
				mochi.app.label("notifications.topic.account"), event="account:" + notification["id"])
	if newest:
		account_cursor_set(acc["id"], "notifications", newest)

def account_notification(acc, raw):
	"""One notification in the network's own form as title, body and link."""
	if acc["type"] == "mastodon":
		kind = str(raw.get("type", ""))
		actor = raw.get("account") or {}
		name = str(actor.get("display_name") or actor.get("acct") or "")
		status = raw.get("status") if type(raw.get("status")) == "dict" else {}
		url = safe_link(str(status.get("url", "") or actor.get("url", "") or ""))
		body = text_cut(strip_html(str(status.get("content", "") or "")), 200)
		labels = {"mention": "notifications.account.mention", "status": "notifications.account.posted", "reblog": "notifications.account.shared", "follow": "notifications.account.followed", "favourite": "notifications.account.liked", "update": "notifications.account.edited"}
		label = labels.get(kind, "")
		if not label:
			return None
		return {"id": str(raw.get("id", "")), "title": mochi.app.label(label, name=name), "body": body, "url": url}
	reason = str(raw.get("reason", ""))
	actor = raw.get("author") or {}
	name = str(actor.get("displayName") or actor.get("handle") or "")
	handle = str(actor.get("handle", ""))
	uri = str(raw.get("uri", ""))
	rkey = uri.rsplit("/", 1)[-1] if "/" in uri else ""
	labels = {"mention": "notifications.account.mention", "reply": "notifications.account.replied", "quote": "notifications.account.quoted", "repost": "notifications.account.shared", "like": "notifications.account.liked", "follow": "notifications.account.followed"}
	label = labels.get(reason, "")
	if not label:
		return None
	if reason in ("mention", "reply", "quote") and handle and rkey:
		url = "https://bsky.app/profile/" + handle + "/post/" + rkey
	elif handle:
		url = "https://bsky.app/profile/" + handle
	else:
		url = ""
	record = raw.get("record") if type(raw.get("record")) == "dict" else {}
	return {"id": uri or str(raw.get("cid", "")), "title": mochi.app.label(label, name=name), "body": text_cut(str(record.get("text", "") or ""), 200), "url": url}

def backup_account(acc):
	"""Add to the account's archive in the user's storage: the posts since the
	last backup, a month's worth a file, and on Bluesky the repository as
	exported by its server."""
	cursor, _ = account_cursor(acc["id"], "backup/posts")
	directory = "backups/" + acc["id"]
	newest = ""
	rows = []
	page = mochi.account.posts(acc["id"], limit=ACCOUNT_PAGE)
	for raw in (page or {}).get("items") or []:
		item = account_item(acc, raw)
		if not item or not item["guid"]:
			continue
		if not newest:
			newest = item["guid"]
		if item["guid"] == cursor:
			break
		rows.append(raw)
	if rows:
		name = directory + "/posts-" + mochi.time.local(mochi.time.now(), "date")[:7] + ".jsonl"
		existing = mochi.file.read(name) if mochi.file.exists(name) else None
		lines = [json.encode(raw) for raw in reversed(rows)]
		data = (str(existing) + "\n" if existing else "") + "\n".join(lines) + "\n"
		mochi.file.write(name, data)
	if newest:
		account_cursor_set(acc["id"], "backup/posts", newest)
	if acc["type"] == "bluesky" and acc.get("server"):
		did = (mochi.account.get(acc["id"]) or {}).get("did", "")
		if did:
			answer = mochi.account.media(acc["id"], "https://" + acc["server"] + "/xrpc/com.atproto.sync.getRepo?did=" + did)
			if answer and answer.get("status") == 200 and answer.get("data"):
				mochi.file.write(directory + "/repository.car", answer["data"])
	account_cursor_set(acc["id"], "backup", "")

def action_backups(a):
	"""The archive files of an account the feed publishes to."""
	feed = publish_feed(a)
	if not feed:
		return
	acc = publish_account(a.input("account", ""))
	if not acc:
		a.error.label(404, "errors.account_not_linked")
		return
	a.json({"files": sorted([str(entry) for entry in mochi.file.list("backups/" + acc["id"]) or []])})

def action_backup_file(a):
	"""One archive file, for the owner to download."""
	feed = publish_feed(a)
	if not feed:
		return
	acc = publish_account(a.input("account", ""))
	name = mochi.file.clean(a.input("name", ""), 120)
	if not acc or not name or "/" in name:
		a.error.label(404, "errors.backup_not_found")
		return
	path = "backups/" + acc["id"] + "/" + name
	if not mochi.file.exists(path):
		a.error.label(404, "errors.backup_not_found")
		return
	a.write.file(path, storage=True)

# === Schema ===

def publish_schema_create():
	"""The tables publishing and the accounts' jobs keep, made at creation and
	by the migration alike."""
	mochi.db.execute("create table if not exists publish ( feed text not null, account text not null, created integer not null, address text not null default '', url text not null default '', primary key ( feed, account ) )")
	# A hosted account's address and page beside its id, so a visitor's follow
	# control, which runs with no user, can name it (phase 15).
	columns = [c["name"] for c in mochi.db.table("publish")]
	for column in ["address", "url"]:
		if column not in columns:
			mochi.db.execute("alter table publish add column " + column + " text not null default ''")
	mochi.db.execute("create table if not exists copies ( post text not null, account text not null default '', address text not null, network text not null, remote text not null, url text not null default '', created integer not null, primary key ( post, address ) )")
	mochi.db.execute("create table if not exists published ( feed text not null, remote text not null, primary key ( feed, remote ) )")
	replies_schema_create()
	mochi.db.execute("create table if not exists account_cursors ( account text not null, kind text not null, cursor text not null default '', updated integer not null default 0, primary key ( account, kind ) )")
	if not any([c["name"] == "since" for c in mochi.db.table("sources")]):
		mochi.db.execute("alter table sources add column since integer not null default 0")

# === Hosted fediverse accounts (the federation plan, phase 15) ===
#
# A hosted account publishes through core's ActivityPub engine, which signs and
# delivers as the account and serves what the account published under its id:
# the object a post becomes is built here, in the network's form, both when the
# post goes out and when another server asks for it (activitypub/object). The
# text goes whole, as sanitised HTML with mention and hashtag links, since a
# receiving server shows a remote post of any length; the attachments that fit
# Mastodon's defaults go as links to this server's public attachment routes,
# the rest are left to the post's page, which the object names as its url
# (decision 24). A visitor from another network follows a feed's account from
# their own server through the follow control, which asks their server where
# to send them: the subscribe template WebFinger publishes.

# What Mastodon's defaults take of a post's attachments (decision 24).
FEDIVERSE_LIMITS = {"images": MASTODON_ATTACHMENTS, "video": 1, "image_bytes": MASTODON_IMAGE_BYTES, "video_bytes": MASTODON_VIDEO_BYTES, "description": MASTODON_DESCRIPTION}

# The public, as a Note addresses it.
FEDIVERSE_PUBLIC = "https://www.w3.org/ns/activitystreams#Public"

def fediverse_tags_base():
	"""Where a hashtag link in a published post leads: this server's feed
	search, or nothing where the server has no public address."""
	base = mochi.server.url()
	if not base:
		return ""
	return base + "/feeds/search?q=%23"

def fediverse_attachment(feed_id, att, variant=""):
	"""An attachment as a Document in a Note: its public address here, as the
	attachment routes serve it, the preview variant for an image over the
	limit. None where the server has no public address."""
	base = mochi.server.url()
	fingerprint = mochi.entity.fingerprint(feed_id)
	if not base or not fingerprint:
		return None
	url = base + "/feeds/" + fingerprint + "/-/attachments/" + att["id"]
	if variant:
		url += "/" + variant
	document = {"type": "Document", "mediaType": mochi.file.type(att.get("name", "")), "url": url}
	description = text_cut(att.get("description") or att.get("caption") or "", FEDIVERSE_LIMITS["description"])
	if description:
		document["name"] = description
	return document

def fediverse_attachments(feed_id, attachments):
	"""The attachments of a post that go in its Note: images and videos within
	Mastodon's defaults, in the post's order, the kind of the first deciding
	where one kind goes per post, as publish_media chooses them."""
	eligible = [att for att in attachments if attachment_kind(att)]
	if not eligible:
		return []
	kind = attachment_kind(eligible[0])
	count = FEDIVERSE_LIMITS["video"] if kind == "video" else FEDIVERSE_LIMITS["images"]
	maximum = FEDIVERSE_LIMITS["video_bytes"] if kind == "video" else FEDIVERSE_LIMITS["image_bytes"]
	documents = []
	for att in eligible:
		if attachment_kind(att) != kind or len(documents) >= count:
			continue
		variant = ""
		if number(att.get("size", 0)) > maximum:
			if kind != "image":
				continue
			variant = "preview"
		document = fediverse_attachment(feed_id, att, variant)
		if document:
			documents.append(document)
	return documents

def fediverse_plain(text):
	"""Plain text as markdown that renders to the same text: the characters
	markdown reads as markup escaped, each line its own paragraph."""
	lines = []
	for line in text.split("\n"):
		for mark in ["\\", "*", "_", "[", "]", "`", "#", ">", "~"]:
			line = line.replace(mark, "\\" + mark)
		lines.append(line.replace("<", "&lt;"))
	return "\n\n".join(lines)

def fediverse_note(acc, feed, post_id, body, format, link, attachments, source, features=None):
	"""The Note a post becomes on a hosted fediverse account: the text as HTML
	with mentions and hashtags linked and tagged, the attachments that fit, the
	post's page as its url, and a sourced post's origin named first (decision
	30). Its content warning is the summary, its sensitive flag travels, its
	language names the content's, a poll makes it a Question, and its
	visibility sets the addressing: public to the public with the followers
	told, unlisted the other way about, followers-only to the followers alone
	(phase 17). Core gives it its id, its author and its time, and the public
	addressing unless the Note carries its own: it does when someone is
	mentioned, so that their server is told too."""
	features = features or post_features({})
	text = sourced_text(source, body) if source else body
	if format != "markdown":
		text = fediverse_plain(text)
	rendered = mochi.text.fediverse(text, tags=fediverse_tags_base())
	note = {"type": "Note", "content": rendered["html"], "sensitive": bool(features["sensitive"]) or bool(features["warning"])}
	if features["warning"]:
		note["summary"] = features["warning"]
	if features["language"]:
		note["contentMap"] = {features["language"]: rendered["html"]}
	poll = features.get("poll")
	if poll:
		note["type"] = "Question"
		options = [{"type": "Note", "name": o["name"], "replies": {"type": "Collection", "totalItems": number(o.get("votes", 0))}} for o in poll["options"]]
		note["anyOf" if poll.get("multiple") else "oneOf"] = options
		note["votersCount"] = number(poll.get("voters", 0))
		if number(poll.get("expires", 0)) > 0:
			note["endTime"] = mochi.time.local(number(poll["expires"]), "rfc3339", timezone="UTC")
			if number(poll["expires"]) <= mochi.time.now():
				note["closed"] = note["endTime"]
	if acc.get("url") and features["visibility"] != "public":
		if features["visibility"] == "unlisted":
			note["to"] = [acc["url"] + "/followers"]
			note["cc"] = [FEDIVERSE_PUBLIC]
		else:
			note["to"] = [acc["url"] + "/followers"]
			note["cc"] = []
	if link:
		note["url"] = link
	if source and source.get("link"):
		note["url"] = source["link"]
	tags = []
	mentioned = []
	for mention in rendered["mentions"]:
		tag = {"type": "Mention", "name": mention["handle"], "href": mention["url"]}
		found = mochi.account.resolve(mention["handle"])
		if found and found.get("id"):
			tag["href"] = found["id"]
			mentioned.append(found["id"])
		tags.append(tag)
	base = fediverse_tags_base()
	for hashtag in rendered["hashtags"]:
		tag = {"type": "Hashtag", "name": "#" + hashtag}
		if base:
			tag["href"] = base + hashtag
		tags.append(tag)
	if tags:
		note["tag"] = tags
	if mentioned and acc.get("url"):
		if features["visibility"] == "public":
			note["to"] = [FEDIVERSE_PUBLIC]
			note["cc"] = [acc["url"] + "/followers"] + mentioned
		else:
			note["cc"] = (note.get("cc") or []) + mentioned
	documents = fediverse_attachments(feed["id"], attachments or [])
	if documents:
		note["attachment"] = documents
	return note

def function_activitypub_object(context, account, id):
	"""An object this feed published as a hosted account, as it stands now:
	core's engine asks for it when another server fetches it or reads the
	account's outbox. None where the copy is gone or the feed no longer
	public."""
	row = mochi.db.row("select post from copies where account=? and remote=?", account, id)
	if not row:
		return None
	post = mochi.db.row("select * from posts where id=?", row["post"])
	if not post:
		return None
	feed = mochi.db.row("select * from feeds where id=?", post["feed"])
	if not feed or feed.get("privacy", "public") != "public":
		return None
	source = None
	data = json.decode(post.get("data", "") or "{}", {})
	rss = data.get("rss") if type(data) == "dict" else None
	if type(rss) == "dict" and rss.get("source"):
		source = {"name": rss.get("source", ""), "link": safe_link(rss.get("link", ""))}
	acc = mochi.account.get(account)
	if not acc:
		return None
	return fediverse_note(acc, feed, post["id"], post["body"], post.get("format", "markdown"), post_link(feed["id"], post["id"]), attachment_list(post["id"]), source, post_features(post))

def function_activitypub_featured(context, account):
	"""The objects a hosted account pins: the copies of the pinned posts of
	the feeds publishing to it, newest pin first."""
	return [row["remote"] for row in mochi.db.rows("select c.remote from copies c join posts p on p.id=c.post where c.account=? and p.pinned>0 order by p.pinned desc", account)]

def follow_accounts(feed_id):
	"""The hosted accounts a feed publishes to, as a visitor sees them: the
	address and the page kept on the publish list, nothing of the account
	itself, which a request with no user could not read."""
	return [{"address": row["address"], "url": row["url"]} for row in mochi.db.rows("select address, url from publish where feed=? and address!='' order by created", feed_id)]

def action_follow(a):
	"""The follow control of a public feed page: a visitor gives the handle of
	their account elsewhere, and is answered the page on their own server that
	follows the feed's account - the subscribe template their server publishes,
	with the account's address in it. Public, since the visitor has no account
	here; the lookup runs under the host policy and the limiter per host."""
	feed = get_feed(a)
	if not feed:
		a.error.label(404, "errors.feed_not_found")
		return
	if feed.get("privacy", "public") != "public":
		a.error.label(403, "errors.access_denied")
		return
	accounts = follow_accounts(feed["id"])
	if not accounts:
		a.error.label(404, "errors.account_not_found")
		return
	handle = a.input("handle", "").strip()
	if handle.startswith("@"):
		handle = handle[1:]
	if not handle or len(handle) > 255 or "@" not in handle or " " in handle:
		a.error.label(400, "errors.invalid_handle")
		return
	chosen = accounts[0]
	wanted = a.input("account", "")
	for acc in accounts:
		if wanted and acc["address"] == wanted:
			chosen = acc
	found = mochi.account.resolve(handle)
	if not found:
		a.error.label(404, "errors.server_not_found")
		return
	if not found.get("subscribe"):
		# GoToSocial, among others, publishes no page that takes an address
		# to follow: its people search for it in their own app instead.
		a.error.label(404, "errors.no_subscribe", address=chosen["address"])
		return
	a.json({"url": found["subscribe"].replace("{uri}", chosen["address"])})

# === Fediverse interactions (the federation plan, phase 16) ===
#
# What comes back to a hosted account from the fediverse. A reply to a post
# the feed published, or to a comment under it, becomes a comment by its
# author's own id on their network; a Like a reaction; an Announce a boost on
# the post; and the person's edits and deletes follow their comment. A follow,
# a mention, a boost and a like each raise a notification. Core's engine
# verifies every activity before activitypub/receive sees it, so what arrives
# here is from the actor it names; this side decides what it means to a feed.
# A reply is matched before it is mapped (decision 31): one that is a copy of
# a comment already held is not stored again. A Mochi subscriber's comment
# goes out as a reply from their own hosted account when they chose one, and
# the comment's event carries the reply's ids for the owner to record. The
# same for linked accounts (decision 9): a reply or a like on a copy published
# through one, read from the account's notifications, comes back to the post.

# The reactions the fediverse's own vocabulary maps to: a Like is a like, and
# the emoji reactions Misskey and Pleroma send that have a counterpart here.
FEDIVERSE_REACTIONS = {"👍": "like", "👎": "dislike", "❤️": "love", "❤": "love", "😂": "laugh", "😮": "amazed", "😢": "sad", "😠": "angry"}

def replies_schema_create():
	"""The copies a comment was published as (decision 31): the comment, the
	account it went out through (empty for a copy another server made), the
	address, the network, the id there and its page."""
	mochi.db.execute("create table if not exists replies ( comment text not null, account text not null default '', address text not null, network text not null, remote text not null, url text not null default '', created integer not null, primary key ( comment, address ) )")
	mochi.db.execute("create index if not exists replies_remote on replies( remote )")

def replies_record(comment_id, account_id, entry):
	mochi.db.execute("insert or replace into replies ( comment, account, address, network, remote, url, created ) values ( ?, ?, ?, ?, ?, ?, ? )",
		comment_id, account_id, entry["address"], entry["network"], entry["remote"], entry.get("url", ""), mochi.time.now())

def replies_store(comment_id, copies):
	"""Keep the copies a comment event carries, and answer them as the event
	carries them on."""
	kept = []
	if not listlike(copies):
		return kept
	for c in copies:
		if type(c) != "dict":
			continue
		address, network, remote, url = str(c.get("address", "")), str(c.get("network", "")), str(c.get("remote", "")), safe_link(str(c.get("url", "")))
		if not address or not remote or len(address) > 500 or len(remote) > 2000:
			continue
		entry = {"address": address, "network": network, "remote": remote, "url": url}
		replies_record(comment_id, "", entry)
		kept.append(entry)
	return kept

def reply_note(comment_id, post_id, body):
	"""The Note a comment is as a reply: the text as the fediverse shows it, in
	reply to the comment it answers where that one is on the network, else to
	the post's copy, naming the comment it is so the owner's server knows it
	when it arrives by the network. Answers the Note and whom it replies to:
	the address of the post's account, or the id of the comment's author."""
	comment = mochi.db.row("select parent from comments where id=?", comment_id)
	parent = mochi.db.row("select subscriber, remote from comments where id=?", comment["parent"]) if comment and comment.get("parent") else None
	if parent and parent.get("remote") and not mochi.text.valid(parent["subscriber"], "entity"):
		target = {"address": parent["subscriber"], "remote": parent["remote"]}
	else:
		target = mochi.db.row("select address, remote from copies where post=? and network='fediverse' order by created limit 1", post_id)
	if not target:
		# A post from a followed person (phase 17): the reply answers the
		# original, by its id on their server.
		post = mochi.db.row("select author, remote from posts where id=?", post_id)
		if post and post.get("remote") and post.get("author") and not mochi.text.valid(post["author"], "entity"):
			target = {"address": post["author"], "remote": post["remote"]}
	if not target:
		return None, None
	note = {"type": "Note", "content": mochi.text.fediverse(fediverse_plain(body), tags=fediverse_tags_base())["html"], "inReplyTo": target["remote"], "sensitive": False, "mochi:comment": comment_id}
	return note, target

def bluesky_reference(acc, uri):
	"""A Bluesky post as a record reference {uri, cid}, with the root of its
	thread, read through the account from the index; None when the index does
	not answer."""
	answer = mochi.account.request(acc["id"], "GET", "app.bsky.feed.getPosts", query={"uris": uri})
	data = answer.get("data") if answer and type(answer.get("data")) == "dict" else {}
	posts = data.get("posts") if listlike(data.get("posts")) else []
	if not posts or type(posts[0]) != "dict" or not posts[0].get("cid"):
		return None
	post = posts[0]
	reference = {"uri": str(post.get("uri", uri)), "cid": str(post["cid"])}
	record = post.get("record") if type(post.get("record")) == "dict" else {}
	reply = record.get("reply") if type(record.get("reply")) == "dict" else {}
	root = reply.get("root") if type(reply.get("root")) == "dict" else None
	if root and root.get("uri") and root.get("cid"):
		return {"reference": reference, "root": {"uri": str(root["uri"]), "cid": str(root["cid"])}}
	return {"reference": reference, "root": reference}

def reply_record(acc, comment_id, post_id, body):
	"""The post record a comment is as a reply on Bluesky (phase 19): in reply
	to the comment it answers where that one is a Bluesky post, else to the
	post's record - a followed person's post, or the post's own copy through
	the account - with the thread's root as the network wants it. Answers the
	record, or None where nothing on Bluesky is answered."""
	comment = mochi.db.row("select parent from comments where id=?", comment_id)
	parent = mochi.db.row("select remote from comments where id=?", comment["parent"]) if comment and comment.get("parent") else None
	uri = ""
	if parent and str(parent.get("remote", "") or "").startswith("at://"):
		uri = str(parent["remote"])
	else:
		post = mochi.db.row("select * from posts where id=?", post_id)
		record = post_record(post) if post else None
		if record:
			uri = record["uri"]
		else:
			copy = mochi.db.row("select remote from copies where post=? and account=?", post_id, acc["id"])
			if copy and str(copy["remote"]).startswith("at://"):
				uri = str(copy["remote"])
	if not uri:
		return None
	found = bluesky_reference(acc, uri)
	if not found:
		return None
	text = publish_excerpt(body, BLUESKY_CHARACTERS, "", False)
	record = {"$type": "app.bsky.feed.post", "text": text, "reply": {"root": found["root"], "parent": found["reference"]}}
	facets = bluesky_facets(text)
	if facets:
		record["facets"] = facets
	return record

def reply_object(acc, comment_id, post_id, body):
	"""A comment as the reply an account publishes: a Note on the fediverse, a
	post record on Bluesky. Answers (object, network) or (None, None)."""
	if acc.get("type") == "bluesky":
		return reply_record(acc, comment_id, post_id, body), "bluesky"
	note, answered = reply_note(comment_id, post_id, body)
	if not note:
		return None, None
	target = mochi.account.resolve(answered["address"])
	if target and target.get("id") and acc.get("url"):
		note["to"] = [FEDIVERSE_PUBLIC]
		note["cc"] = [acc["url"] + "/followers", target["id"]]
		note["tag"] = [{"type": "Mention", "name": target.get("address") or answered["address"], "href": target["id"]}]
	return note, "fediverse"

def reply_publish(account_id, post_id, comment_id, body):
	"""Publish a comment as a reply from the commenter's own hosted account to
	the post's copy or origin on the fediverse or on Bluesky (decision 31).
	Answers the copies made, for the comment's event."""
	if not account_id:
		return []
	acc = publish_account(account_id)
	if not acc or not acc.get("hosted"):
		return []
	object, network = reply_object(acc, comment_id, post_id, body)
	if not object:
		return []
	result = mochi.account.object.create(acc["id"], object, key="reply|" + comment_id + "|" + acc["id"])
	if not result or not result.get("id"):
		return []
	entry = {"address": acc.get("identifier", ""), "network": network, "remote": str(result["id"]), "url": str(result.get("url", "") or "")}
	replies_record(comment_id, acc["id"], entry)
	return [entry]

def reply_update(comment_id, body):
	"""An edit of a comment follows the replies it went out as."""
	rows = mochi.db.rows("select account, remote from replies where comment=? and account!=''", comment_id)
	if not rows:
		return
	comment = mochi.db.row("select post from comments where id=?", comment_id)
	if not comment:
		return
	for r in rows:
		acc = publish_account(r["account"])
		if not acc:
			continue
		object, _ = reply_object(acc, comment_id, comment["post"], body)
		if object:
			mochi.account.object.update(r["account"], r["remote"], object)

def reply_delete(comment_id):
	"""A deleted comment withdraws the replies it went out as."""
	for r in mochi.db.rows("select account, remote from replies where comment=? and account!=''", comment_id):
		if publish_account(r["account"]):
			mochi.account.object.delete(r["account"], r["remote"])
	mochi.db.execute("delete from replies where comment=?", comment_id)

def replies_present(comment_id):
	return [{"address": r["address"], "network": r["network"], "remote": r["remote"], "url": r["url"]} for r in mochi.db.rows("select address, network, remote, url from replies where comment=? order by created", comment_id)]

# === What arrives ===

def object_id_of(value):
	"""An object's id: the string it is, or the id of the object given."""
	if type(value) == "string":
		return value
	if type(value) == "dict":
		return str(value.get("id", "") or "")
	return ""

def same_host(a, b):
	"""Whether two ids are on one host."""
	parts_a, parts_b = a.split("/"), b.split("/")
	return len(parts_a) > 2 and len(parts_b) > 2 and parts_a[2].lower() == parts_b[2].lower()

def account_person(actor):
	"""What to show for a person on the fediverse, by their id: the name, the
	page and the address from the lookup core caches."""
	found = mochi.account.resolve(actor) or {}
	name = str(found.get("name") or found.get("address") or found.get("username") or "")
	if not name:
		name = actor.split("/")[-1] or actor
	return {"name": name[:100], "page": safe_link(str(found.get("url", "") or "")), "address": str(found.get("address", "") or ""), "avatar": safe_link(str(found.get("avatar", "") or ""))}

def account_notify(acc, label, name, body, url, event):
	"""A notification about the account to the bell, under the accounts topic."""
	mochi.service.call("notifications", "send", "account", acc["id"], mochi.app.label(label, name=name), body, url,
		mochi.app.label("notifications.topic.account"), event="account:" + event)

def fediverse_time(value):
	"""A time the network gives, or now when it is missing or unreasonable."""
	parsed = mochi.time.parse(str(value or ""))
	now = mochi.time.now()
	if not parsed or parsed > now + 300 or parsed < now - 315360000:
		return now
	return parsed

def fediverse_target(account_id, object_id):
	"""What an object id names of ours: ("post", post) for a copy the account
	published, ("comment", comment) for a comment held - one from another
	network by its own id, or one of ours by the reply it went out as."""
	if not object_id:
		return None, None
	row = mochi.db.row("select post from copies where account=? and remote=?", account_id, object_id)
	if row:
		post = mochi.db.row("select * from posts where id=?", row["post"])
		if post:
			return "post", post
	comment = mochi.db.row("select * from comments where remote=?", object_id)
	if not comment:
		reply = mochi.db.row("select comment from replies where remote=?", object_id)
		if reply:
			comment = mochi.db.row("select * from comments where id=?", reply["comment"])
	if comment:
		return "comment", comment
	return None, None

def fediverse_may_comment(acc, feed_id, actor):
	"""Who may reply (decided 2026-10-02): the feed's own rules first - a deny
	for the person, then a grant for them or for anyone - and otherwise a
	follower of the account, as a subscriber may comment. The grant to any
	signed-in user ("+") is for Mochi users, not a person on another network,
	as a non-subscriber's comment is refused unless anyone may comment."""
	resource = "feed/" + feed_id
	operations = ["manage", "*"] + ACCESS_LEVELS[ACCESS_LEVELS.index("comment"):]
	granted = False
	for rule in (mochi.access.list.resource(resource) or []):
		if rule.get("operation") not in operations:
			continue
		if rule.get("subject") == actor:
			if not rule.get("grant"):
				return False
			granted = True
		elif rule.get("subject") == "*" and rule.get("grant"):
			granted = True
	if granted:
		return True
	return len(mochi.account.followers(acc["id"], actor=actor) or []) > 0

def fediverse_mentions(acc, note):
	for tag in note.get("tag") or []:
		if type(tag) == "dict" and str(tag.get("type", "")) == "Mention" and str(tag.get("href", "")) == acc.get("url", ""):
			return True
	return False

def comment_from_network(acc, post, parent, actor, name, page, body, format, remote, created):
	"""Store a comment by a person on another network, tell the owner and fan
	it out to the subscribers as any comment is."""
	feed_id = post["feed"]
	comment_id = mochi.uid()
	mochi.db.execute("insert into comments ( id, feed, post, parent, subscriber, name, body, format, created, attachment, remote, page, account ) values ( ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ? )",
		comment_id, feed_id, post["id"], parent, actor, name, body, format, created, remote, page, acc["id"])
	mochi.db.commit.fire("comments", "insert", comment_id)
	set_post_updated(post["id"], created)
	set_feed_updated(feed_id, created)
	me = service_identity()
	notify_comment(feed_id, me["id"] if me else "", {"id": comment_id, "post": post["id"], "parent": parent, "subscriber": actor, "name": name, "body": strip_html(body) if format == "html" else body})
	broadcast_event(feed_id, "comment/create", {"id": comment_id, "post": post["id"], "parent": parent, "created": created,
		"subscriber": actor, "name": name, "body": body, "format": format, "attachment": "", "remote": remote, "page": page}, "")
	return comment_id

def comment_edit_from_network(comment, body, edited):
	"""An edit of a comment from another network, applied and fanned out."""
	mochi.db.execute("update comments set body=?, edited=? where id=?", body, edited, comment["id"])
	mochi.db.commit.fire("comments", "update", comment["id"])
	set_post_updated(comment["post"])
	set_feed_updated(comment["feed"])
	for s in mochi.db.rows("select id from subscribers where feed=?", comment["feed"]):
		mochi.message.send(headers(comment["feed"], s["id"], "comment/edit"), {"comment": comment["id"], "post": comment["post"], "body": body, "edited": edited})

def comment_delete_from_network(comment):
	"""A deletion of a comment from another network, applied and fanned out."""
	delete_comment_tree(comment["id"])
	set_post_updated(comment["post"])
	set_feed_updated(comment["feed"])
	broadcast_websocket(comment["feed"], {"type": "comment/delete", "feed": comment["feed"], "post": comment["post"], "comment": comment["id"], "sender": comment["subscriber"]})
	for s in mochi.db.rows("select id from subscribers where feed=?", comment["feed"]):
		mochi.message.send(headers(comment["feed"], s["id"], "comment/delete"), {"comment": comment["id"], "post": comment["post"]})

def reaction_from_network(kind, target, actor, name, reaction):
	"""A reaction by a person on another network to a post or a comment, or its
	removal, applied and fanned out; a reaction raises a notification."""
	feed_id = target["feed"]
	if kind == "post":
		if reaction:
			mochi.db.execute("replace into reactions ( feed, post, subscriber, name, reaction ) values ( ?, ?, ?, ?, ? )", feed_id, target["id"], actor, name, reaction)
		else:
			mochi.db.execute("delete from reactions where feed=? and post=? and comment='' and subscriber=?", feed_id, target["id"], actor)
		update_post_scores(target["id"])
		set_post_updated(target["id"])
		post_id, comment_id = target["id"], ""
		broadcast_event(feed_id, "post/react", {"feed": feed_id, "post": post_id, "subscriber": actor, "name": name, "reaction": reaction}, "")
		broadcast_websocket(feed_id, {"type": "react/post", "feed": feed_id, "post": post_id, "sender": actor})
	else:
		comment_reaction_set(target, actor, name, reaction)
		post_id, comment_id = target["post"], target["id"]
		broadcast_event(feed_id, "comment/react", {"feed": feed_id, "post": post_id, "comment": comment_id, "subscriber": actor, "name": name, "reaction": reaction}, "")
		broadcast_websocket(feed_id, {"type": "react/comment", "feed": feed_id, "post": post_id, "comment": comment_id, "sender": actor})
	if reaction:
		me = service_identity()
		notify_reaction(feed_id, me["id"] if me else "", post_id, comment_id, actor, name, reaction)

def boost_from_network(acc, post, actor, delta):
	"""A boost of a post, or its undoing, counted on the post."""
	mochi.db.execute("update posts set boosts=max(boosts+?, 0) where id=?", delta, post["id"])
	set_post_updated(post["id"])
	if delta > 0:
		person = account_person(actor)
		account_notify(acc, "notifications.account.shared", person["name"], text_cut(strip_html(post["body"]), 200), post_url(post["feed"], post["id"]), "boost:" + actor + ":" + post["id"])

def function_activitypub_receive(context, account, activities):
	"""The activities core's engine queued for a hosted account, each verified
	as from the actor it names. A follow and a mention raise notifications;
	a reply, a like, a boost and their undoing, an edit and a delete act on
	the posts the account published and the comments under them."""
	acc = mochi.account.get(account)
	if not acc or not hosted_fediverse(acc):
		return None
	for item in activities or []:
		if type(item) != "dict":
			continue
		actor = str(item.get("actor", "") or "")
		kind = str(item.get("type", "") or "")
		activity = item.get("activity")
		if type(activity) != "dict" or not actor:
			continue
		object = activity.get("object")
		# A direct message is chat's, kept as a conversation (phase 22); a
		# vote in a poll comes direct too, and stays here.
		if kind == "Create" and type(object) == "dict" and object_direct(object) and not poll_vote_shaped(object):
			continue
		# What a followed person sends comes first (phase 17): their posts and
		# boosts, their edits and deletions of them, their move.
		if kind in ("Create", "Announce", "Update", "Delete", "Move") and followed_received(acc, actor, kind, activity):
			continue
		if kind == "Follow":
			person = account_person(actor)
			account_notify(acc, "notifications.account.followed", person["name"], person["address"], person["page"], "follow:" + actor)
		elif kind == "Create":
			fediverse_created(acc, actor, object)
		elif kind == "Update":
			fediverse_updated(acc, actor, object)
		elif kind == "Delete":
			fediverse_deleted(acc, actor, object)
		elif kind == "Like":
			fediverse_reacted(acc, actor, object, "like")
		elif kind == "EmojiReact":
			fediverse_reacted(acc, actor, object, FEDIVERSE_REACTIONS.get(str(activity.get("content", "") or "").strip(), ""))
		elif kind == "Announce":
			fediverse_announced(acc, actor, object, 1)
		elif kind == "Undo" and type(object) == "dict":
			inner = str(object.get("type", "") or "")
			if inner in ("Like", "EmojiReact"):
				fediverse_reacted(acc, actor, object.get("object"), "")
			elif inner == "Announce":
				fediverse_announced(acc, actor, object.get("object"), -1)
	return None

def fediverse_created(acc, actor, note):
	"""A Note from the fediverse: a reply to a post the account published or to
	a comment under one becomes a comment by its author; one that only
	mentions the account raises a notification."""
	if type(note) != "dict" or str(note.get("type", "") or "") not in ("Note", "Article", "Page", "Question"):
		return
	remote = object_id_of(note)
	if not remote or len(remote) > 2000 or not same_host(remote, actor) or object_id_of(note.get("attributedTo")) not in ("", actor):
		return
	# A reply of our own arriving by the network after its event, or one seen
	# already, is not stored again (decision 31).
	if mochi.db.exists("select 1 from replies where remote=?", remote) or mochi.db.exists("select 1 from comments where remote=?", remote):
		return
	named = str(note.get("mochi:comment", "") or "")
	if named and mochi.text.valid(named, "line"):
		# A Mochi subscriber's reply names the comment it is: recorded against
		# that comment whether or not the comment's own event has come yet.
		person = account_person(actor)
		replies_record(named, "", {"address": person["address"] or actor, "network": "fediverse", "remote": remote, "url": safe_link(str(note.get("url", "") or ""))})
		return
	kind, target = fediverse_target(acc["id"], object_id_of(note.get("inReplyTo")))
	if not kind:
		if fediverse_mentions(acc, note):
			person = account_person(actor)
			account_notify(acc, "notifications.account.mention", person["name"], text_cut(strip_html(str(note.get("content", "") or "")), 200), safe_link(str(note.get("url", "") or "")) or remote, "mention:" + remote)
		return
	post = target if kind == "post" else mochi.db.row("select * from posts where id=?", target["post"])
	if not post:
		return
	# A vote in a poll the account published: a Note with the option's name
	# and no content, in reply to the Question (phase 17).
	if kind == "post" and note.get("name") and not str(note.get("content", "") or "").strip() and poll_of(post):
		vote_from_network(acc, post, actor, str(note.get("name")))
		return
	if not fediverse_may_comment(acc, post["feed"], actor):
		mochi.log.info("Feeds dropping a reply from %s: not allowed to comment on feed %s", actor, post["feed"])
		return
	body = mochi.text.clean(str(note.get("content", "") or ""))
	if not body.strip() or not mochi.text.valid(body, "text"):
		return
	person = account_person(actor)
	comment_from_network(acc, post, target["id"] if kind == "comment" else "", actor, person["name"], person["page"], body, "html", remote, fediverse_time(note.get("published")))

def fediverse_updated(acc, actor, note):
	"""A person's edit of their own comment."""
	if type(note) != "dict":
		return
	remote = object_id_of(note)
	comment = mochi.db.row("select * from comments where remote=? and subscriber=?", remote, actor) if remote else None
	if not comment:
		return
	body = mochi.text.clean(str(note.get("content", "") or ""))
	if not body.strip() or not mochi.text.valid(body, "text"):
		return
	comment_edit_from_network(comment, body, fediverse_time(note.get("updated")))

def fediverse_deleted(acc, actor, object):
	"""A person's deletion of their own comment. A deleted account leaves its
	comments, as a Mochi member's deletion does."""
	remote = object_id_of(object)
	if not remote or remote == actor:
		return
	comment = mochi.db.row("select * from comments where remote=? and subscriber=?", remote, actor)
	if comment:
		comment_delete_from_network(comment)

def fediverse_reacted(acc, actor, object, reaction):
	"""A Like or an emoji reaction, or its undoing, on a post or a comment."""
	kind, target = fediverse_target(acc["id"], object_id_of(object))
	if not kind:
		return
	if reaction and not is_reaction_valid(reaction)["valid"]:
		return
	person = account_person(actor)
	reaction_from_network(kind, target, actor, person["name"], reaction)

def fediverse_announced(acc, actor, object, delta):
	"""A boost of a post the account published, or its undoing."""
	kind, target = fediverse_target(acc["id"], object_id_of(object))
	if kind != "post":
		return
	boost_from_network(acc, target, actor, delta)

# === Through a linked account ===

def account_interaction(acc, raw):
	"""A reply, a like or a share of a copy published through a linked account,
	read from the account's notifications, back to the post (decision 9)."""
	if acc["type"] == "mastodon":
		kind = str(raw.get("type", "") or "")
		status = raw.get("status") if type(raw.get("status")) == "dict" else None
		person = raw.get("account") if type(raw.get("account")) == "dict" else {}
		if not status or not person:
			return
		actor = str(person.get("uri") or person.get("url") or "")
		name = str(person.get("display_name") or person.get("acct") or "")[:100]
		page = safe_link(str(person.get("url", "") or ""))
		if not mochi.text.valid(actor, "author") or mochi.text.valid(actor, "entity"):
			return
		if kind == "mention":
			copy = linked_copy(acc, str(status.get("in_reply_to_id", "") or ""))
			remote = str(status.get("uri", "") or status.get("url", "") or "")
			if copy and remote:
				linked_comment(acc, copy, actor, name, page, mochi.text.clean(str(status.get("content", "") or "")), "html", remote, status.get("created_at"))
		elif kind == "favourite":
			copy = linked_copy(acc, str(status.get("id", "") or ""))
			if copy:
				reaction_from_network("post", copy, actor, name, "like")
		elif kind == "reblog":
			copy = linked_copy(acc, str(status.get("id", "") or ""))
			if copy:
				boost_from_network(acc, copy, actor, 1)
	elif acc["type"] == "bluesky":
		reason = str(raw.get("reason", "") or "")
		author = raw.get("author") if type(raw.get("author")) == "dict" else {}
		record = raw.get("record") if type(raw.get("record")) == "dict" else {}
		actor = str(author.get("did", "") or "")
		handle = str(author.get("handle", "") or "")
		name = str(author.get("displayName") or handle or "")[:100]
		page = "https://bsky.app/profile/" + handle if handle else ""
		if not actor or not mochi.text.valid(actor, "author"):
			return
		if reason == "reply":
			parent = record.get("reply", {}).get("parent", {}) if type(record.get("reply")) == "dict" else {}
			copy = linked_copy(acc, str(parent.get("uri", "") or "") if type(parent) == "dict" else "")
			remote = str(raw.get("uri", "") or "")
			if copy and remote:
				linked_comment(acc, copy, actor, name, page, str(record.get("text", "") or ""), "text", remote, record.get("createdAt"))
		elif reason == "like":
			copy = linked_copy(acc, str(raw.get("reasonSubject", "") or ""))
			if copy:
				reaction_from_network("post", copy, actor, name, "like")
		elif reason == "repost":
			copy = linked_copy(acc, str(raw.get("reasonSubject", "") or ""))
			if copy:
				boost_from_network(acc, copy, actor, 1)

def linked_copy(acc, remote):
	"""The post whose copy through the account has this id there, or None."""
	if not remote:
		return None
	row = mochi.db.row("select post from copies where account=? and remote=?", acc["id"], remote)
	if not row:
		return None
	return mochi.db.row("select * from posts where id=?", row["post"])

def linked_comment(acc, post, actor, name, page, body, format, remote, created):
	"""A reply read from a linked account's notifications as a comment on the
	post, once; the feed's deny rules apply, since the account's own network
	admitted the reply."""
	if mochi.db.exists("select 1 from comments where remote=?", remote) or mochi.db.exists("select 1 from replies where remote=?", remote):
		return
	if access_denied(actor, "feed/" + post["feed"], "comment"):
		return
	if not body.strip() or not mochi.text.valid(body, "text"):
		return
	comment_from_network(acc, post, "", actor, name, page, body, format, remote, fediverse_time(created))

# === The reply control and the owner's moderation ===

def action_reply(a):
	"""The reply control of a public feed page: a visitor gives the handle of
	their account elsewhere and is answered the page on their own server that
	replies to the post's copy on the fediverse, as the follow control does.
	Public, since the visitor has no account here."""
	feed = get_feed(a)
	if not feed:
		a.error.label(404, "errors.feed_not_found")
		return
	if feed.get("privacy", "public") != "public":
		a.error.label(403, "errors.access_denied")
		return
	post_id = a.input("post", "")
	copy = mochi.db.row("select remote from copies where post=? and network='fediverse' and account!='' order by created limit 1", post_id) if mochi.text.valid(post_id, "id") else None
	if not copy or not mochi.db.exists("select 1 from posts where id=? and feed=?", post_id, feed["id"]):
		a.error.label(404, "errors.reply_not_found")
		return
	handle = a.input("handle", "").strip()
	if handle.startswith("@"):
		handle = handle[1:]
	if not handle or len(handle) > 255 or "@" not in handle or " " in handle:
		a.error.label(400, "errors.invalid_handle")
		return
	found = mochi.account.resolve(handle)
	if not found:
		a.error.label(404, "errors.server_not_found")
		return
	if not found.get("subscribe"):
		# A server with no such page: the visitor searches for the post's
		# copy in their own app instead.
		a.error.label(404, "errors.no_subscribe", address=copy["remote"])
		return
	a.json({"url": found["subscribe"].replace("{uri}", copy["remote"])})

def comment_outsider(a):
	"""The comment the route names, on a feed the caller manages, by a person
	on another network; None with the error written otherwise."""
	if not a.user or not a.user.identity or not a.user.identity.id:
		a.error.label(401, "errors.not_logged_in")
		return None
	feed = get_feed(a)
	if not feed or not check_access(a, feed["id"], "manage"):
		a.error.label(403, "errors.access_denied")
		return None
	row = mochi.db.row("select * from comments where id=? and feed=?", a.input("comment"), feed["id"])
	if not row:
		a.error.label(404, "errors.comment_not_found")
		return None
	if mochi.text.valid(row["subscriber"], "entity") or not row.get("account"):
		a.error.label(400, "errors.not_outside_author")
		return None
	return row

def action_comment_block(a):
	"""Block the person behind a comment from another network: nothing more of
	theirs reaches the owner's accounts, and they are no longer a follower."""
	row = comment_outsider(a)
	if not row:
		return
	mochi.account.block.add(row["subscriber"])
	return {"data": {"blocked": row["subscriber"]}}

def action_comment_mute(a):
	"""Mute the person behind a comment from another network: they may still
	follow, but nothing more of theirs reaches the apps."""
	row = comment_outsider(a)
	if not row:
		return
	mochi.account.mute.add(row["subscriber"])
	return {"data": {"muted": row["subscriber"]}}

def action_comment_report(a):
	"""Report the person behind a comment from another network to their own
	server's moderators, with the comment and the reason given."""
	row = comment_outsider(a)
	if not row:
		return
	reason = a.input("reason", "") or ""
	if len(reason) > 2000:
		a.error.label(400, "errors.invalid_body")
		return
	objects = [row["remote"]] if row.get("remote") else []
	mochi.account.report(row["account"], row["subscriber"], objects=objects, content=reason)
	return {"data": {"reported": row["subscriber"]}}

# === Following with no account (the federation plan, phase 13) ===
#
# A public account or community on another network is followed as a source of
# a feed by its handle or link, with no account of the owner's on that network:
# a Mastodon or Lemmy account or community through the web feed its server
# publishes, as an rss source; a Bluesky account through its post records,
# which its data server serves to anyone, as the source type person/posts. The
# same lookup serves the search page, where a handle or a post link is looked
# up, and a post's first link to a post on another network is quoted with the
# post.

PERSON_TYPES = ["person/posts"]

# The stand-in for an account where a public person is read with none: the
# network for the item's shape, no id for the copies' guards.
PERSON_ACCOUNT = {"id": "", "type": "bluesky"}

# What a quote keeps of a post's text.
QUOTE_TEXT = 2000

# Seconds a step of a follows import spends before booking the next.
FOLLOWS_BUDGET = 40

# === Lookup ===

def lookup_person(query):
	"""Look a handle or link up: a person or community on another network as
	mochi.account.resolve answers it, with the kind "person" or "group", or a
	post as mochi.url.quote answers it, with the kind "post". None when the
	query names neither."""
	q = query.strip()
	if not q or len(q) > 2048 or " " in q:
		return None
	if q.startswith("http://") or q.startswith("https://"):
		# On the Bluesky app a post link names the account and the record; a
		# profile link names the account by handle or identifier.
		parts = q.split("bsky.app/profile/", 1)
		if len(parts) == 2 and parts[0] in ("https://", "http://"):
			if "/post/" in parts[1]:
				return lookup_post(q)
			q = parts[1].strip("/").split("?", 1)[0]
		else:
			found = mochi.account.resolve(q)
			if found:
				return lookup_present(found)
			return lookup_post(q)
	elif q.startswith("!") or q.startswith("@"):
		q = q[1:]
	found = mochi.account.resolve(q)
	return lookup_present(found) if found else None

def lookup_present(found):
	"""A resolved person or community as the client shows it."""
	return {
		"kind": "group" if found.get("type") == "group" else "person",
		"network": found.get("network", ""),
		"id": found.get("id", ""),
		"name": found.get("name") or found.get("address") or "",
		"address": found.get("address", ""),
		"avatar": safe_link(found.get("avatar", "")),
		"url": safe_link(found.get("url", "")),
		"username": found.get("username", ""),
		"host": found.get("host", ""),
	}

def lookup_post(link):
	"""A post at a link, as a quote, with its author."""
	quote = sanitize_quote(mochi.url.quote(link))
	if not quote:
		return None
	return {"kind": "post", "network": quote.get("network", ""), "quote": quote}

def action_lookup(a):
	"""A handle or link looked up from search."""
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	query = a.input("query", "")
	if not query.strip():
		a.error.label(400, "errors.no_search_entered")
		return
	found = lookup_person(query)
	if not found:
		a.error.label(404, "errors.person_not_found")
		return
	a.json(found)

# === Sources ===

def person_feeds(found):
	"""Where a fediverse server may publish a person's or community's posts as
	a web feed, in the forms Mastodon, Lemmy, Pleroma, Misskey and Pixelfed
	use, likeliest first."""
	host, name, page = found.get("host", ""), found.get("username", ""), found.get("url", "")
	if not host or not name:
		return []
	base = "https://" + host
	if found.get("kind") == "group":
		return [base + "/feeds/c/" + name + ".xml?sort=New"]
	urls = []
	if page.startswith("https://"):
		urls.append(page + ".rss")
	urls.append(base + "/feeds/u/" + name + ".xml?sort=New")
	urls.append(base + "/users/" + name + "/feed.atom")
	urls.append(base + "/@" + name + ".atom")
	urls.append(base + "/users/" + name + ".atom")
	return urls

def person_feed(found):
	"""The first web feed of a person's or community's that answers, with its
	document, or (None, None)."""
	for url in person_feeds(found):
		result = mochi.rss.fetch(url, {})
		status = result.get("status", 0)
		if status >= 200 and status < 300 and (result.get("items") or result.get("title")):
			return (url, result)
	return (None, None)

def sources_add_person(a, feed, query, name):
	"""Follow a public account or community by handle or link: through its
	server's web feed on the fediverse, through its post records on Bluesky."""
	found = lookup_person(query)
	if not found:
		a.error.label(404, "errors.person_not_found")
		return
	if found["kind"] == "post":
		a.error.label(400, "errors.not_a_person")
		return
	name = name or found["name"]
	if found["network"] == "bluesky":
		if mochi.db.exists("select 1 from sources where feed=? and type='person/posts' and url=?", feed["id"], found["id"]):
			a.error.label(400, "errors.source_exists")
			return
		# A user with a hosted Bluesky account follows with it, so the follow
		# shows on Bluesky; their posts are still read by polling, since the
		# network pushes nothing to a follower (phase 19). Without one, the
		# person's public records are read as before.
		acc = follow_account(a.input("account", ""), "bluesky") if found.get("id") else None
		if acc:
			source, count = person_follow_create(feed, found, acc, name, a.user.identity.id)
			if not source:
				a.error.label(502, "errors.follow_not_sent")
				return
			return {"data": {"source": source, "ingested": count, "state": source_state(source)}}
		source, count = person_source_create(feed["id"], found["id"], name, a.user.identity.id)
		return {"data": {"source": source, "ingested": count}}
	# On the fediverse a user with a hosted account follows with it, and
	# their posts arrive as they are made (phase 17); without one, through
	# the person's web feed.
	acc = follow_account(a.input("account", "")) if found["network"] == "fediverse" and found.get("id") else None
	if acc:
		if mochi.db.exists("select 1 from sources where feed=? and type='person/posts' and url=?", feed["id"], found["id"]):
			a.error.label(400, "errors.source_exists")
			return
		source, count = person_follow_create(feed, found, acc, name, a.user.identity.id)
		if not source:
			a.error.label(502, "errors.follow_not_sent")
			return
		return {"data": {"source": source, "ingested": count, "state": source_state(source)}}
	url, result = person_feed(found)
	if not url:
		a.error.label(502, "errors.no_feed_for_person")
		return
	return sources_add_rss(a, feed, url, name, result)

def bluesky_feed_uri(query):
	"""The record URI of a Bluesky custom feed or list, from its link on the
	Bluesky app (profile/<actor>/feed/<key>, profile/<actor>/lists/<key>) or
	the URI itself; the actor a handle is resolved to its identifier. Answers
	(type, uri) or (None, None)."""
	q = query.strip()
	actor, kind, rkey = "", "", ""
	if q.startswith("at://"):
		parts = q[5:].split("/")
		if len(parts) == 3:
			actor, rkey = parts[0], parts[2]
			kind = {"app.bsky.feed.generator": "generator/posts", "app.bsky.graph.list": "list/posts"}.get(parts[1], "")
	else:
		parts = q.split("bsky.app/profile/", 1)
		if len(parts) == 2 and parts[0] in ("https://", "http://"):
			path = parts[1].split("?", 1)[0].strip("/").split("/")
			if len(path) == 3:
				actor, rkey = path[0], path[2]
				kind = {"feed": "generator/posts", "lists": "list/posts"}.get(path[1], "")
	if not actor or not kind or not rkey or not mochi.text.valid(rkey, "text") or len(rkey) > 512:
		return None, None
	if not actor.startswith("did:"):
		found = mochi.account.resolve(actor)
		if not found or found.get("network") != "bluesky" or not found.get("id"):
			return None, None
		actor = found["id"]
	collection = "app.bsky.feed.generator" if kind == "generator/posts" else "app.bsky.graph.list"
	return kind, "at://" + actor + "/" + collection + "/" + rkey

def sources_add_bluesky(a, feed, query, name):
	"""A Bluesky custom feed or list as a source, read through one of the
	user's accounts on Bluesky (the index answers a signed-in account), polled
	on the sources schedule (phase 19)."""
	acc = bluesky_account(a.input("account", ""))
	if not acc:
		a.error.label(404, "errors.account_not_found")
		return
	kind, uri = bluesky_feed_uri(query)
	if not kind:
		a.error.label(400, "errors.not_a_bluesky_feed")
		return
	if mochi.db.exists("select 1 from sources where feed=? and type=? and url=?", feed["id"], kind, uri):
		a.error.label(400, "errors.source_exists")
		return
	source_id = mochi.uid()
	now = mochi.time.now()
	base = 300
	mochi.db.execute("insert into sources (id, feed, type, url, name, account, credibility, base, max, interval, next, jitter, changed, fetched) values (?, ?, ?, ?, ?, ?, 100, ?, 86400, ?, ?, 60, ?, ?)",
		source_id, feed["id"], kind, uri, name or uri.rsplit("/", 1)[-1], acc["id"], base, base, now + base + 60, now, now)
	source = mochi.db.row("select * from sources where id=?", source_id)
	count, _ = poll_bluesky_feed_source(source, a.user.identity.id, None, False)
	mochi.schedule.after("schedule_sources_poll", {"feed": feed["id"]}, base)
	ensure_sources_watchdog()
	return {"data": {"source": mochi.db.row("select * from sources where id=?", source_id), "ingested": count}}

def poll_bluesky_feed_source(source, user_id=None, deadline=None, notify=True):
	"""Read the newest page of a Bluesky custom feed or list through the
	source's account and make posts of what is new. Answers (count, complete)."""
	now = mochi.time.now()
	acc = publish_account(source.get("account", "")) or bluesky_account("")
	new_count, complete = 0, True
	if acc:
		if source["type"] == "generator/posts":
			answer = mochi.account.request(acc["id"], "GET", "app.bsky.feed.getFeed", query={"feed": source["url"], "limit": str(ACCOUNT_PAGE)})
		else:
			answer = mochi.account.request(acc["id"], "GET", "app.bsky.feed.getListFeed", query={"list": source["url"], "limit": str(ACCOUNT_PAGE)})
		data = answer.get("data") if answer and type(answer.get("data")) == "dict" else {}
		items = data.get("feed") if listlike(data.get("feed")) else []
		feed = mochi.db.row("select * from feeds where id=?", source["feed"])
		new_count, complete = ingest_account_items(feed, source, PERSON_ACCOUNT, items, user_id, deadline, notify)
	source_polled(source, new_count, now)
	return (new_count, complete)

def person_source_create(feed_id, did, name, user_id):
	"""The person/posts source row for a Bluesky account, with its newest
	page as the source's history, as an RSS source's document is: not news,
	not published. Answers (source, ingested)."""
	source_id = mochi.uid()
	now = mochi.time.now()
	base = 300
	mochi.db.execute("insert into sources (id, feed, type, url, name, credibility, base, max, interval, next, jitter, changed, fetched) values (?, ?, 'person/posts', ?, ?, 100, ?, 86400, ?, ?, 60, ?, ?)",
		source_id, feed_id, did, name, base, base, now + base + 60, now, now)
	source = mochi.db.row("select * from sources where id=?", source_id)
	count, _ = poll_person_source(source, user_id, None, False)
	mochi.schedule.after("schedule_sources_poll", {"feed": feed_id}, base)
	ensure_sources_watchdog()
	return (mochi.db.row("select * from sources where id=?", source_id), count)

def poll_person_source(source, user_id=None, deadline=None, notify=True):
	"""Read the newest page of a followed Bluesky account's posts from its
	data server and make posts of what is new. A server that does not answer
	is a poll with nothing new. Answers (count, complete)."""
	now = mochi.time.now()
	page = mochi.account.posts(source["url"], limit=ACCOUNT_PAGE)
	feed = mochi.db.row("select * from feeds where id=?", source["feed"])
	new_count, complete = ingest_account_items(feed, source, PERSON_ACCOUNT, (page or {}).get("items") or [], user_id, deadline, notify)
	source_polled(source, new_count, now)
	return (new_count, complete)

# === Quotes ===

def quote_link(body):
	"""The first web link in a post's text, which may be a post on another
	network."""
	for token in body.split():
		for prefix in ("https://", "http://"):
			at = token.find(prefix)
			if at >= 0:
				link = token[at:].rstrip(".,;:!?)]}>'\"")
				if "." in link[len(prefix):]:
					return link
	return None

def post_quote(body):
	"""The post on another network a post's first link names, or None."""
	link = quote_link(body)
	if not link:
		return None
	return sanitize_quote(mochi.url.quote(link))

def sanitize_quote(quote):
	"""A quote as it is kept and sent: known fields only, links safe, the text
	cut; None where it is not a quote of a post."""
	if type(quote) != "dict":
		return None
	url = safe_link(str(quote.get("url", "") or ""))
	text = str(quote.get("text", "") or "")
	image = safe_link(str(quote.get("image", "") or ""))
	if not url or not text and not image:
		return None
	clean = {
		"network": str(quote.get("network", "") or ""),
		"url": url,
		"id": str(quote.get("id", "") or "")[:2048],
		"text": text_cut(text, QUOTE_TEXT),
		"image": image,
		"created": number(quote.get("created", 0)),
	}
	author = quote.get("author")
	if type(author) == "dict":
		clean["author"] = {
			"id": str(author.get("id", "") or "")[:2048],
			"name": str(author.get("name", "") or "")[:200],
			"address": str(author.get("address", "") or "")[:300],
			"avatar": safe_link(str(author.get("avatar", "") or "")),
			"url": safe_link(str(author.get("url", "") or "")),
		}
	return clean

# === Importing follows ===

def link_next(header):
	"""The max_id of the next page a Link header names, or empty."""
	for part in header.split(","):
		if 'rel="next"' not in part:
			continue
		url = part.split("<", 1)[-1].split(">", 1)[0]
		for pair in url.split("?", 1)[-1].split("&"):
			if pair.startswith("max_id="):
				return pair[7:]
	return ""

def import_follows_page(acc, cursor):
	"""A page of the account's follows, each {network, identifier, name}, and
	the cursor for the next page. On Mastodon the cursor carries the account's
	own id, read once, before the page's max_id."""
	if acc["type"] == "mastodon":
		if not cursor:
			me = mochi.account.request(acc["id"], "GET", "v1/accounts/verify_credentials")
			own = str(((me or {}).get("data") or {}).get("id", "") or "")
			if not own:
				return {"items": [], "cursor": ""}
			cursor = own + "|"
		own, _, max_id = cursor.partition("|")
		query = {"limit": "80"}
		if max_id:
			query["max_id"] = max_id
		answer = mochi.account.request(acc["id"], "GET", "v1/accounts/" + own + "/following", query=query)
		items = answer.get("data") if answer and listlike(answer.get("data")) else []
		next = link_next(str(answer.get("link", "") or "")) if answer else ""
		follows = [{"network": "fediverse", "identifier": str(f.get("url") or f.get("uri") or ""), "name": str(f.get("display_name") or f.get("acct") or "")} for f in items if type(f) == "dict"]
		return {"items": follows, "cursor": (own + "|" + next) if next and items else ""}
	query = {"actor": acc.get("identifier", ""), "limit": "100"}
	if cursor:
		query["cursor"] = cursor
	answer = mochi.account.request(acc["id"], "GET", "app.bsky.graph.getFollows", query=query)
	data = answer.get("data") if answer and type(answer.get("data")) == "dict" else {}
	follows = [{"network": "bluesky", "identifier": str(f.get("did", "") or ""), "name": str(f.get("displayName") or f.get("handle") or "")} for f in (data.get("follows") or []) if type(f) == "dict"]
	return {"items": follows, "cursor": str(data.get("cursor", "") or "") if follows else ""}

def follow_source(feed, follow, user_id, acc=None):
	"""One follow as a source of the feed, unless the feed has it already:
	through the hosted account given where the person is on the fediverse,
	else through their web feed. Answers whether a source was added."""
	feed_id = feed["id"]
	if follow["network"] == "bluesky":
		did = follow["identifier"]
		if not did or mochi.db.exists("select 1 from sources where feed=? and type='person/posts' and url=?", feed_id, did):
			return False
		# Through the user's hosted Bluesky account where they have one, so the
		# follow shows on the network (phase 19).
		hosted = acc if acc and hosted_bluesky(acc) else follow_account("", "bluesky")
		if hosted:
			source, _ = person_follow_create(feed, {"id": did, "network": "bluesky"}, hosted, follow["name"], user_id)
			return bool(source)
		person_source_create(feed_id, did, follow["name"], user_id)
		return True
	found = lookup_person(follow["identifier"]) if follow["identifier"] else None
	if not found or found["kind"] == "post":
		return False
	if acc and found["network"] == "fediverse" and found.get("id"):
		if mochi.db.exists("select 1 from sources where feed=? and type='person/posts' and url=?", feed_id, found["id"]):
			return False
		source, _ = person_follow_create(feed, found, acc, follow["name"] or found["name"], user_id)
		return bool(source)
	url, result = person_feed(found)
	if not url or mochi.db.exists("select 1 from sources where feed=? and url=?", feed_id, url):
		return False
	rss_source_create(feed_id, url, follow["name"] or found["name"], result, user_id)
	return True

def import_follows_step(feed, acc, cursor, user_id):
	"""A step of a follows import: the follows of one page from where the last
	step stopped, each a source, until the step's budget is spent; the next
	step is booked for the rest. The cursor is the page's, then the offset in
	it. Answers (count, more)."""
	page_cursor, _, offset = cursor.partition("#")
	offset = int(offset) if offset and decimal(offset) else 0
	deadline = mochi.time.now() + FOLLOWS_BUDGET
	page = import_follows_page(acc, page_cursor)
	items = page.get("items") or []
	count = 0
	for index in range(offset, len(items)):
		if mochi.time.now() >= deadline:
			mochi.schedule.after("schedule_import", {"feed": feed["id"], "account": acc["id"], "kind": "follows", "cursor": page_cursor + "#" + str(index)}, 2)
			return (count, True)
		if follow_source(feed, items[index], user_id):
			count += 1
	next = page.get("cursor", "") or ""
	if not next:
		return (count, False)
	mochi.schedule.after("schedule_import", {"feed": feed["id"], "account": acc["id"], "kind": "follows", "cursor": next + "#0"}, 2)
	return (count, True)

# === Following on the fediverse (the federation plan, phase 17) ===
#
# A person on the fediverse is followed as one of the user's hosted accounts:
# the Follow goes out from the account, their server accepts it - or waits,
# for a locked account, which the source shows as pending - and from then on
# what they post reaches the inbox addressed to their followers, which core
# routes to the account and hands to activitypub/receive. Each post becomes
# a post of the feed the source belongs to, as an RSS item does: with the
# person's own id as its author, its id on the network, its content warning
# and sensitive flag, its language, its media, its poll, the custom emoji it
# names and, for a boost, who boosted it. A pushed source is never polled;
# its history is the person's outbox, read once when the source is added,
# not news and not published. A hashtag has no push on the fediverse, so it
# is a polled source over a server's tag feed. A user with no hosted account
# follows through the person's web feed as before (phase 13). Replying to a
# followed person's post is a comment on it here that goes out from the
# commenter's hosted account in reply to the original; voting in their poll
# a Note naming the option, to its author alone, as the network has it.

PERSON_HISTORY = 40
FILTER_MAXIMUM = 100
IMPORT_ADDRESSES_MAXIMUM = 5000

def follow_account(wanted, network="fediverse"):
	"""The hosted account on a network a follow goes through: the one named,
	else the user's first; None where the user has none, or named one they
	lack."""
	accounts = [acc for acc in publish_accounts() if acc.get("hosted") and acc.get("type") == network]
	for acc in accounts:
		if wanted and acc["id"] == wanted:
			return acc
	if wanted:
		return None
	return accounts[0] if accounts else None

def bluesky_account(wanted):
	"""An account on Bluesky a feed reads through, hosted or linked: the one
	named, else the user's first hosted one, else their first linked one."""
	accounts = [acc for acc in publish_accounts() if acc.get("type") == "bluesky"]
	for acc in accounts:
		if wanted and acc["id"] == wanted:
			return acc
	if wanted:
		return None
	hosted = [acc for acc in accounts if acc.get("hosted")]
	return hosted[0] if hosted else (accounts[0] if accounts else None)

def person_follow_create(feed, found, acc, name, user_id):
	"""Follow a person as the account and make them a source of the feed,
	with their newest posts as the source's history (not news, not
	published). A fediverse person's posts are then pushed, so the source is
	never polled; a Bluesky person's are polled from the moment the source
	is made. Answers (source, ingested); (None, 0) when the follow could not
	be sent."""
	followed = mochi.account.follow(acc["id"], found["id"])
	if not followed:
		return None, 0
	source_id = mochi.uid()
	now = mochi.time.now()
	next = (now + 300 + 60) if found["network"] == "bluesky" else 0
	mochi.db.execute("insert into sources (id, feed, type, url, name, account, credibility, base, max, interval, next, jitter, changed, fetched) values (?, ?, 'person/posts', ?, ?, ?, 100, 300, 86400, 300, ?, 60, ?, ?)",
		source_id, feed["id"], found["id"], name, acc["id"], next, now, now)
	if next:
		mochi.schedule.after("schedule_sources_poll", {"feed": feed["id"]}, 300)
		ensure_sources_watchdog()
	source = mochi.db.row("select * from sources where id=?", source_id)
	count = 0
	page = mochi.account.posts(found["id"], limit=PERSON_HISTORY, signer=acc["id"])
	if page and listlike(page.get("items")):
		count, _ = ingest_account_items(feed, source, acc, page["items"], user_id, None, False)
	return source, count

def person_followed_elsewhere(acc, actor, except_source):
	"""Whether another feed still follows the person through the account."""
	return mochi.db.exists("select 1 from sources where type='person/posts' and account=? and url=? and id!=?", acc["id"], actor, except_source)

def source_state(source):
	"""What a followed source's follow has come to: following, pending the
	other server's acceptance, or refused (no follow row at all). On Bluesky a
	follow needs no acceptance."""
	acc = publish_account(source.get("account", ""))
	if not acc or not acc.get("hosted"):
		return ""
	rows = mochi.account.following(acc["id"], actor=source["url"]) or []
	if not rows:
		return "refused"
	return "following" if number(rows[0].get("accepted", 0)) > 0 else "pending"

def object_url(value):
	"""An object's url property as a safe link: a string, the first of a list,
	or a Link's href."""
	if type(value) == "string":
		return safe_link(value)
	if type(value) == "list":
		for v in value:
			found = object_url(v)
			if found:
				return found
		return ""
	if type(value) == "dict":
		return safe_link(str(value.get("href", "") or value.get("id", "") or ""))
	return ""

def listlike(value):
	"""Whether a value is a list: core hands a JSON array to Starlark as a
	tuple, a form or a peer as a list."""
	return type(value) in ("list", "tuple")

def object_list(value):
	"""A property that is one object or a list of them, as a list."""
	if listlike(value):
		return list(value)
	if value == None:
		return []
	return [value]

def object_media(note):
	"""A Note's attachments as the media a post shows: each by its address on
	the network, its kind, its description and its blurhash."""
	media = []
	for att in object_list(note.get("attachment")):
		if type(att) != "dict":
			continue
		url = object_url(att.get("url")) or object_url(att.get("href"))
		if not url:
			continue
		kind = str(att.get("mediaType", "") or "")
		if kind.startswith("image/") or str(att.get("type", "")) == "Image":
			media_kind = "image"
		elif kind.startswith("video/") or str(att.get("type", "")) == "Video":
			media_kind = "video"
		elif kind.startswith("audio/") or str(att.get("type", "")) == "Audio":
			media_kind = "audio"
		else:
			media_kind = "file"
		item = {"url": url, "type": media_kind}
		name = str(att.get("name", "") or att.get("summary", "") or "")
		if name:
			item["name"] = name
		if att.get("blurhash"):
			item["blurhash"] = str(att["blurhash"])
		for key in ["width", "height"]:
			if number(att.get(key, 0)) > 0:
				item[key] = number(att[key])
		media.append(item)
	return media

def object_poll(note):
	"""A Question's options with their counts, when it closes and how many
	voted; None for a Note that is not one."""
	if str(note.get("type", "") or "") != "Question":
		return None
	multiple = listlike(note.get("anyOf"))
	options = []
	for option in object_list(note.get("anyOf") if multiple else note.get("oneOf")):
		if type(option) != "dict":
			continue
		replies = option.get("replies") if type(option.get("replies")) == "dict" else {}
		options.append({"name": str(option.get("name", "") or ""), "votes": number(replies.get("totalItems", 0))})
	poll = sanitize_poll({"options": options, "multiple": multiple, "voters": number(note.get("votersCount", 0))})
	if not poll:
		return None
	if note.get("endTime"):
		poll["expires"] = mochi.time.parse(str(note["endTime"])) or 0
	if note.get("closed") and not poll["expires"]:
		poll["expires"] = mochi.time.parse(str(note["closed"])) or mochi.time.now()
	return poll

def object_emoji(note):
	"""The custom emoji a Note's tags name."""
	emoji = []
	for tag in object_list(note.get("tag")):
		if type(tag) != "dict" or str(tag.get("type", "") or "") != "Emoji":
			continue
		icon = tag.get("icon") if type(tag.get("icon")) == "dict" else {}
		url = object_url(icon.get("url"))
		name = str(tag.get("name", "") or "").strip(":")
		if name and url:
			emoji.append({"name": name, "url": url})
	return emoji

def object_visibility(note):
	"""A Note's visibility from its addressing: public when the public is
	addressed, unlisted when only told, followers-only otherwise."""
	if FEDIVERSE_PUBLIC in object_list(note.get("to")) or "as:Public" in object_list(note.get("to")) or "Public" in object_list(note.get("to")):
		return "public"
	if FEDIVERSE_PUBLIC in object_list(note.get("cc")) or "as:Public" in object_list(note.get("cc")) or "Public" in object_list(note.get("cc")):
		return "unlisted"
	return "followers"

def object_direct(note):
	"""Whether a Note is a direct message: addressed to neither the public nor
	anyone's followers. A Note addressed to no one says nothing either way."""
	addresses = [object_id_of(x) for x in object_list(note.get("to")) + object_list(note.get("cc"))]
	if not addresses or object_visibility(note) != "followers":
		return False
	for address in addresses:
		if address.endswith("/followers"):
			return False
	return True

def poll_vote_shaped(note):
	"""Whether a Note has a poll vote's shape: an option's name and no content."""
	return bool(note.get("name")) and not str(note.get("content", "") or "").strip()

def fediverse_item(acc, raw):
	"""A post from the fediverse as a sourced item: a Note, Article, Page or
	Question as the person's server gives it, or an Announce of one, read as
	the account. None for anything else, and for a reply."""
	if type(raw) != "dict":
		return None
	kind = str(raw.get("type", "") or "")
	note = raw
	booster = None
	if kind == "Announce":
		object_id = object_id_of(raw.get("object"))
		if not object_id:
			return None
		note = raw["object"] if type(raw.get("object")) == "dict" else mochi.account.object.read(acc["id"], object_id)
		if type(note) != "dict":
			return None
		by = str(raw.get("actor", "") or "")
		if by and mochi.text.valid(by, "author") and not mochi.text.valid(by, "entity"):
			booster = account_person(by)
			booster["id"] = by
		kind = str(note.get("type", "") or "")
	if kind not in ("Note", "Article", "Page", "Question") or note.get("inReplyTo"):
		return None
	remote = object_id_of(note)
	actor = object_id_of(note.get("attributedTo"))
	if not remote or len(remote) > 2000 or not actor or not mochi.text.valid(actor, "author") or mochi.text.valid(actor, "entity"):
		mochi.log.debug("Feeds fediverse_item: %s by %s is not a post of a person", remote, actor)
		return None
	person = account_person(actor)
	person["id"] = actor
	html = mochi.text.clean(str(note.get("content", "") or ""))
	text = strip_html(html)
	title = str(note.get("name", "") or "") if kind in ("Article", "Page") else ""
	if title:
		text = (title + "\n\n" + text) if text else title
	media = object_media(note)
	image = ""
	for m in media:
		if m["type"] == "image":
			image = m["url"]
			break
	warning = strip_html(str(note.get("summary", "") or "")).strip()
	languages = note.get("contentMap") if type(note.get("contentMap")) == "dict" else {}
	language = ""
	for key in languages:
		if valid_language(str(key)):
			language = str(key).lower()
			break
	quote = object_url(note.get("quote")) or object_url(note.get("quoteUrl")) or object_url(note.get("_misskey_quote"))
	return {
		"remotes": [remote], "guid": remote, "created": fediverse_time(note.get("published")), "text": text, "html": html,
		"link": object_url(note.get("url")) or remote, "image": image, "author": person["name"], "boosted": booster["name"] if booster else "",
		"item": {"id": remote},
		"actor": actor, "person": person, "boost": booster, "remote": remote, "visibility": object_visibility(note),
		"warning": text_cut(warning, WARNING_MAXIMUM), "sensitive": 1 if note.get("sensitive") else 0, "language": language,
		"media": media, "poll": object_poll(note), "emoji": object_emoji(note), "quote": quote,
	}

# === What a followed person sends ===

def followed_source(acc, actor):
	"""The source following a person through the account, or None."""
	return mochi.db.row("select * from sources where type='person/posts' and account=? and url=?", acc["id"], actor)

def sourced_remote(remote):
	"""The post here that a post on the network became, or None."""
	if not remote:
		return None
	return mochi.db.row("select * from posts where remote=?", remote)

def followed_received(acc, actor, kind, activity):
	"""An activity by a person a feed follows through the account: their post
	or boost becomes a post of the feed, their edit and deletion follow it,
	and their move takes the source with them. Answers whether the activity
	was taken as a followed person's."""
	source = followed_source(acc, actor)
	object = activity.get("object")
	mochi.log.debug("Feeds followed_received %s from %s: source %s", kind, actor, source["id"] if source else "none")
	if kind == "Move":
		target = object_id_of(activity.get("target"))
		if target and mochi.text.valid(target, "author"):
			followed_moved(acc, actor, target)
		return True
	if kind == "Create" and source and type(object) == "dict" and not object.get("inReplyTo"):
		followed_post(acc, source, object)
		return True
	if kind == "Announce" and source:
		ours, _ = fediverse_target(acc["id"], object_id_of(object))
		if ours:
			return False
		followed_post(acc, source, activity)
		return True
	if kind == "Update" and type(object) == "dict":
		post = sourced_remote(object_id_of(object))
		if post and post.get("author") == actor:
			followed_updated(acc, post, object)
			return True
	if kind == "Delete":
		post = sourced_remote(object_id_of(object))
		if post and post.get("author") == actor:
			sourced_post_delete(post)
			return True
	return False

def followed_post(acc, source, raw):
	"""A followed person's post or boost as a post of the source's feed."""
	feed = mochi.db.row("select * from feeds where id=?", source["feed"])
	if not feed:
		return
	ingest_account_items(feed, source, acc, [raw], None, None)

def followed_updated(acc, post, note):
	"""A followed person's edit of their post, or their poll's new counts,
	applied here and fanned out to the subscribers."""
	item = fediverse_item(acc, note)
	if not item:
		return
	data = json.decode(post.get("data", "") or "{}", None) or {}
	if type(data) != "dict":
		data = {}
	rss = data.get("rss") if type(data.get("rss")) == "dict" else {}
	rss = dict(rss)
	rss.update({"link": item["link"], "html": item["html"], "source": item["author"]})
	if item["image"]:
		rss["image"] = item["image"]
	data["rss"] = rss
	for key in ["person", "media", "poll", "emoji"]:
		if item.get(key):
			data[key] = item[key]
		else:
			data.pop(key, None)
	data = sanitize_post_data(data)
	body = "\n\n".join([p for p in [item["text"], item["link"]] if p])
	edited = fediverse_time(note.get("updated"))
	features = {"visibility": item["visibility"], "warning": item["warning"], "sensitive": item["sensitive"], "language": item["language"]}
	clause, values = features_sql(features)
	mochi.db.execute("update posts set body=?, data=?, updated=?, edited=?, " + clause + " where id=?", *([body, json.encode(data), edited, edited] + values + [post["id"]]))
	mochi.db.commit.fire("posts", "update", post["id"])
	set_feed_updated(post["feed"])
	event = {"post": post["id"], "body": body, "edited": edited, "data": data}
	event.update(features)
	broadcast_event(post["feed"], "post/edit", event, "")

def sourced_post_delete(post):
	"""A post from a source gone from the network: deleted here with what
	hangs off it, and the subscribers told, as the owner's deletion is."""
	post_id, feed_id = post["id"], post["feed"]
	publish_delete(post_id)
	mochi.db.execute("delete from tags where object=?", post_id)
	mochi.db.execute("delete from reactions where post=?", post_id)
	for c in mochi.db.rows("select id from comments where post=?", post_id):
		reply_delete(c["id"])
	mochi.db.execute("delete from comments where post=?", post_id)
	mochi.db.execute("delete from post_scores where post=?", post_id)
	mochi.db.execute("delete from votes where post=?", post_id)
	mochi.db.execute("delete from source_posts where post=?", post_id)
	attachment_clear(post_id)
	mochi.db.execute("delete from posts where id=?", post_id)
	mochi.db.execute("delete from follows where post=?", post_id)
	broadcast_event(feed_id, "post/delete", {"post": post_id}, "")
	broadcast_websocket(feed_id, {"type": "post/delete", "feed": feed_id, "post": post_id, "sender": ""})

def followed_moved(acc, actor, target):
	"""A followed person has moved: every source following them through the
	account follows the new identity, which core has already sent the Follow
	to."""
	person = account_person(target)
	for source in mochi.db.rows("select id, name from sources where type='person/posts' and account=? and url=?", acc["id"], actor):
		mochi.db.execute("update sources set url=?, name=? where id=?", target, person["name"] or source["name"], source["id"])

# === Hashtags ===

def tag_parse(query):
	"""A hashtag on a server, written #tag@host, tag@host or as the server's
	tag page: (base, tag) with base the server's address, or (None, None)."""
	q = query.strip()
	if q.startswith("https://") or q.startswith("http://"):
		scheme, rest = q.split("://", 1)
		parts = rest.split("/")
		if len(parts) >= 3 and parts[1] == "tags":
			return scheme + "://" + parts[0].lower(), parts[2].split("?", 1)[0].split(".", 1)[0]
		return None, None
	if q.startswith("#"):
		q = q[1:]
	if "@" not in q:
		return None, None
	tag, _, host = q.rpartition("@")
	host = host.lower()
	if not tag or not host or "." not in host or " " in q:
		return None, None
	for c in tag.elems():
		if not (c.isalnum() or c == "_"):
			return None, None
	return "https://" + host, tag

def sources_add_tag(a, feed, query, name):
	"""Follow a hashtag on a server through its tag feed, polled as any web
	feed is: no server pushes hashtags."""
	base, tag = tag_parse(query)
	if not base or not tag:
		a.error.label(400, "errors.invalid_hashtag")
		return
	host = base.split("://", 1)[1]
	url = base + "/tags/" + tag + ".rss"
	if mochi.db.exists("select 1 from sources where feed=? and url=?", feed["id"], url):
		a.error.label(400, "errors.source_exists")
		return
	result = mochi.rss.fetch(url, {})
	status = result.get("status", 0)
	if status < 200 or status >= 300 or not (result.get("items") or result.get("title")):
		a.error.label(502, "errors.no_feed_for_tag")
		return
	source, count = rss_source_create(feed["id"], url, name or ("#" + tag + "@" + host), result, a.user.identity.id)
	mochi.db.execute("update sources set type='tag/posts' where id=?", source["id"])
	return {"data": {"source": mochi.db.row("select * from sources where id=?", source["id"]), "ingested": count}}

# === Pins ===

def action_post_pin(a):
	return pin_set(a, True)

def action_post_unpin(a):
	return pin_set(a, False)

def pin_set(a, pinned):
	"""Pin a post of a feed the user owns, or unpin it: shown first, named in
	the featured collection of the accounts it was published to, and told to
	the subscribers."""
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	feed = get_feed(a)
	if not feed or not is_feed_owner(a.user.identity.id, feed):
		a.error.label(403, "errors.access_denied")
		return
	post = mochi.db.row("select * from posts where id=? and feed=?", a.input("post"), feed["id"])
	if not post:
		a.error.label(404, "errors.post_not_found")
		return
	value = mochi.time.now() if pinned else 0
	mochi.db.execute("update posts set pinned=? where id=?", value, post["id"])
	mochi.db.commit.fire("posts", "update", post["id"])
	broadcast_event(feed["id"], "post/pin", {"post": post["id"], "pinned": value}, a.user.identity.id)
	return {"data": {"post": post["id"], "pinned": value}}

def event_post_pin(e):
	"""A pin or unpin by the owner, as a subscriber takes it."""
	feed_data = feed_by_id(e.user.identity.id, e.header("from"))
	if not feed_data:
		return
	post_id = e.content("post")
	if not mochi.text.valid(post_id, "id"):
		return
	mochi.db.execute("update posts set pinned=? where id=? and feed=?", max(number(e.content("pinned")), 0), post_id, feed_data["id"])
	mochi.db.commit.fire("posts", "update", post_id)

# === Polls ===

def poll_of(post):
	"""A post's poll, or None."""
	data = json.decode(post.get("data", "") or "{}", None) if type(post.get("data")) == "string" else post.get("data")
	if type(data) != "dict":
		return None
	return data.get("poll") if type(data.get("poll")) == "dict" else None

def poll_open(poll):
	expires = number(poll.get("expires", 0))
	return not expires or expires > mochi.time.now()

def poll_options_input(a, poll):
	"""The options a vote names, as indexes, validated against the poll:
	None where invalid."""
	raw = a.inputs("option")
	options = []
	for value in raw:
		if not decimal(value):
			return None
		index = int(value)
		if index < 0 or index >= len(poll["options"]) or index in options:
			return None
		options.append(index)
	if not options or (len(options) > 1 and not poll.get("multiple")):
		return None
	return options

def poll_vote_apply(post, voter, options):
	"""Record a voter's choice on a post the user holds the record of and
	recount: the votes by option and the voters in all. Answers the poll."""
	mochi.db.execute("delete from votes where post=? and voter=?", post["id"], voter)
	now = mochi.time.now()
	for index in options:
		mochi.db.execute("insert or ignore into votes (post, option, voter, created) values (?, ?, ?, ?)", post["id"], index, voter, now)
	return poll_recount(post)

def poll_recount(post):
	"""The poll's counts from the votes held, written to the post and fanned
	out to the subscribers."""
	poll = poll_of(post)
	if not poll:
		return None
	for index in range(len(poll["options"])):
		poll["options"][index]["votes"] = mochi.db.row("select count(*) as n from votes where post=? and option=?", post["id"], index)["n"]
	poll["voters"] = mochi.db.row("select count(distinct voter) as n from votes where post=?", post["id"])["n"]
	poll_write(post, poll)
	broadcast_event(post["feed"], "poll/update", {"post": post["id"], "poll": poll}, "")
	broadcast_websocket(post["feed"], {"type": "post/edit", "feed": post["feed"], "post": post["id"]})
	return poll

def poll_write(post, poll):
	data = json.decode(post.get("data", "") or "{}", None) or {}
	if type(data) != "dict":
		data = {}
	data["poll"] = poll
	mochi.db.execute("update posts set data=? where id=?", json.encode(data), post["id"])
	mochi.db.commit.fire("posts", "update", post["id"])

def action_poll_vote(a):
	"""Vote in a post's poll: on a feed the user owns, recorded and recounted
	here; on a subscribed feed, sent to the owner, who holds the record; on a
	post from another network, sent to its author as the network has it."""
	if not a.user or not a.user.identity or not a.user.identity.id:
		a.error.label(401, "errors.not_logged_in")
		return
	result, failure = poll_vote(a.input("feed"), a.input("post"), a.user.identity.id, a.user.identity.name, lambda poll: poll_options_input(a, poll))
	if failure:
		fail(a, failure)
		return
	return {"data": result}

# poll_vote votes in a post's poll with the options choose(poll) picks, or
# None for an invalid choice: on a feed the user owns, recorded and
# recounted here, and a followed person's poll voted in where they are; on a
# subscribed feed, sent to the owner. Answers (result, None) or (None,
# failure).
def poll_vote(feed_input, post_input, user_id, user_name, choose):
	feed = feed_by_id(user_id, feed_input)
	if not feed:
		return None, (404, "errors.feed_not_found")
	if not check_access_user(user_id, feed["id"], "react"):
		return None, (403, "errors.access_denied")
	post = mochi.db.row("select * from posts where id=? and feed=?", post_input, feed["id"])
	poll = poll_of(post) if post else None
	if not poll:
		return None, (404, "errors.no_poll")
	if not poll_open(poll):
		return None, (400, "errors.poll_closed")
	options = choose(poll)
	if options == None:
		return None, (400, "errors.invalid_option")
	if owned(feed["id"]):
		if post.get("remote") and post.get("author") and not mochi.text.valid(post["author"], "entity"):
			# A followed person's poll: the vote goes to them; their Update
			# brings the counts back.
			if not remote_poll_vote(post, options):
				return None, (502, "errors.vote_not_sent")
		poll = poll_vote_apply(post, user_id, options)
	else:
		mochi.db.execute("delete from votes where post=? and voter=?", post["id"], user_id)
		for index in options:
			mochi.db.execute("insert or ignore into votes (post, option, voter, created) values (?, ?, ?, ?)", post["id"], index, user_id, mochi.time.now())
		mochi.message.send({"from": user_id, "to": feed["id"], "service": "feeds", "event": "poll/vote"}, {"post": post["id"], "options": options, "name": user_name})
	return {"post": post["id"], "poll": poll, "voted": options}, None

def remote_poll_vote(post, options):
	"""Our vote in a followed person's poll: a Note naming each chosen option,
	in reply to the Question and addressed to its author alone, from the
	account the source goes through. Answers whether it was sent."""
	source = mochi.db.row("select account from sources where type='person/posts' and url=? and account!='' limit 1", post["author"])
	acc = publish_account(source["account"]) if source else None
	if not acc or not hosted_fediverse(acc):
		return False
	poll = poll_of(post)
	sent = False
	for index in options:
		note = {"type": "Note", "name": poll["options"][index]["name"], "inReplyTo": post["remote"], "to": [post["author"]], "cc": []}
		if mochi.account.object.create(acc["id"], note, key="vote|" + post["id"] + "|" + str(index) + "|" + acc["id"]):
			sent = True
	return sent

def event_poll_vote(e):
	"""A subscriber's vote, as the owner takes it: recorded and recounted."""
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("to"))
	if not feed_data:
		return
	sender = e.header("from")
	post = mochi.db.row("select * from posts where id=? and feed=?", e.content("post"), feed_data["id"])
	poll = poll_of(post) if post else None
	if not poll or not poll_open(poll) or not check_event_access(sender, feed_data["id"], "react"):
		return
	raw = e.content("options")
	if not listlike(raw) or not raw or (len(raw) > 1 and not poll.get("multiple")):
		return
	options = []
	for value in raw:
		index = number(value, -1)
		if index < 0 or index >= len(poll["options"]) or index in options:
			return
		options.append(index)
	poll_vote_apply(post, sender, options)

def event_poll_update(e):
	"""The owner's recount, as a subscriber takes it."""
	feed_data = feed_by_id(e.user.identity.id, e.header("from"))
	if not feed_data:
		return
	post = mochi.db.row("select * from posts where id=? and feed=?", e.content("post"), feed_data["id"])
	poll = sanitize_poll(e.content("poll")) if post else None
	if not poll:
		return
	held = poll_of(post)
	if held and len(held["options"]) != len(poll["options"]):
		return
	poll_write(post, poll)

def vote_from_network(acc, post, actor, name):
	"""A follower's vote in a poll the account published: a Note naming the
	option, recorded by their id."""
	poll = poll_of(post)
	if not poll or not poll_open(poll):
		return
	for index in range(len(poll["options"])):
		if poll["options"][index]["name"] == name:
			existing = [row["option"] for row in mochi.db.rows("select option from votes where post=? and voter=?", post["id"], actor)]
			if index in existing:
				return
			if existing and not poll.get("multiple"):
				return
			poll_vote_apply(post, actor, existing + [index])
			return

# === Boosts ===

def post_record(post):
	"""The Bluesky record a post from Bluesky came from, {uri, cid}, or None."""
	data = json.decode(post.get("data", "") or "{}", {})
	record = data.get("record") if type(data) == "dict" else None
	if type(record) != "dict" or not record.get("uri") or not record.get("cid"):
		return None
	return {"uri": str(record["uri"]), "cid": str(record["cid"])}

def like_publish(post, reaction, wanted):
	"""A like of a post from Bluesky goes out as a like record of the user's
	hosted Bluesky account - the one named, else their first - and any other
	reaction, or none, takes a like back (phase 19)."""
	record = post_record(post)
	if not record:
		return
	acc = follow_account(wanted, "bluesky")
	if not acc:
		return
	existing = mochi.db.row("select remote from likes where post=? and account=?", post["id"], acc["id"])
	if reaction == "like" and not existing:
		result = mochi.account.object.create(acc["id"], {"$type": "app.bsky.feed.like", "subject": record}, key="like|" + post["id"] + "|" + acc["id"])
		if result and result.get("id"):
			mochi.db.execute("insert or replace into likes (post, account, remote, created) values (?, ?, ?, ?)", post["id"], acc["id"], str(result["id"]), mochi.time.now())
	elif reaction != "like" and existing:
		mochi.account.object.delete(acc["id"], existing["remote"])
		mochi.db.execute("delete from likes where post=? and account=?", post["id"], acc["id"])

def action_post_boost(a):
	"""Boost a post from another network from one of the user's hosted
	accounts: an Announce of the original on the fediverse, a repost record
	on Bluesky, which credits its author and copies nothing (decision 30),
	recorded as a copy of the post."""
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	feed = get_feed(a)
	if not feed or not is_feed_owner(a.user.identity.id, feed):
		a.error.label(403, "errors.access_denied")
		return
	post = mochi.db.row("select * from posts where id=? and feed=?", a.input("post"), feed["id"])
	if not post:
		a.error.label(404, "errors.post_not_found")
		return
	result, failure = post_boost(feed, post, a.input("account", ""))
	if failure:
		fail(a, failure)
		return
	return {"data": result}

# post_boost boosts a post from another network from the hosted account
# named, else the user's first on its network, recorded as a copy of the
# post. Answers ({copies}, None) or (None, failure).
def post_boost(feed, post, wanted):
	if not post.get("remote") or not post.get("author") or mochi.text.valid(post["author"], "entity"):
		return None, (400, "errors.not_from_network")
	record = post_record(post)
	network = "bluesky" if record else "fediverse"
	acc = follow_account(wanted, network)
	if not acc:
		return None, (404, "errors.account_not_found")
	if mochi.db.exists("select 1 from copies where post=? and account=?", post["id"], acc["id"]):
		return {"copies": copies_present(post["id"])}, None
	person = account_person(post["author"])
	result = publish_announce(acc, {"remote": post["remote"], "network": network, "name": person["name"], "link": "", "item": record or {"id": post["remote"]}, "created": post["created"]})
	if not result:
		return None, (502, "errors.boost_not_sent")
	copy_record(feed["id"], post["id"], acc, result)
	return {"copies": copies_present(post["id"])}, None

def action_post_unboost(a):
	"""Take a boost back: the Announce is undone and the copy forgotten."""
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	feed = get_feed(a)
	if not feed or not is_feed_owner(a.user.identity.id, feed):
		a.error.label(403, "errors.access_denied")
		return
	post = mochi.db.row("select * from posts where id=? and feed=?", a.input("post"), feed["id"])
	if not post:
		a.error.label(404, "errors.post_not_found")
		return
	result, failure = post_unboost(post, a.input("account", ""))
	if failure:
		fail(a, failure)
		return
	return {"data": result}

# post_unboost takes a boost of a post back from the hosted account named,
# else the user's first on its network. Answers ({copies}, None) or (None,
# failure).
def post_unboost(post, wanted):
	acc = follow_account(wanted, "bluesky" if post_record(post) else "fediverse")
	if not acc:
		return None, (404, "errors.post_not_found")
	row = mochi.db.row("select remote from copies where post=? and account=?", post["id"], acc["id"])
	if row:
		mochi.account.object.delete(acc["id"], row["remote"])
		mochi.db.execute("delete from copies where post=? and account=?", post["id"], acc["id"])
	return {"copies": copies_present(post["id"])}, None

# === Keyword filters ===

def filters_feed(a):
	"""The feed a filter belongs to: one the user owns or subscribes to."""
	if not a.user or not a.user.identity or not a.user.identity.id:
		a.error.label(401, "errors.not_logged_in")
		return None
	feed = get_feed(a)
	if not feed or not check_access(a, feed["id"], "view"):
		a.error.label(404, "errors.feed_not_found")
		return None
	return feed

def action_filters_list(a):
	feed = filters_feed(a)
	if not feed:
		return
	return {"data": {"filters": mochi.db.rows("select id, phrase, created from filters where feed=? order by created", feed["id"])}}

def action_filters_add(a):
	feed = filters_feed(a)
	if not feed:
		return
	phrase = (a.input("phrase") or "").strip()
	if not phrase or len(phrase) > FILTER_MAXIMUM or not mochi.text.valid(phrase, "line"):
		a.error.label(400, "errors.invalid_phrase")
		return
	if mochi.db.exists("select 1 from filters where feed=? and lower(phrase)=lower(?)", feed["id"], phrase):
		return {"data": {"filters": mochi.db.rows("select id, phrase, created from filters where feed=? order by created", feed["id"])}}
	mochi.db.execute("insert into filters (id, feed, phrase, created) values (?, ?, ?, ?)", mochi.uid(), feed["id"], phrase, mochi.time.now())
	return {"data": {"filters": mochi.db.rows("select id, phrase, created from filters where feed=? order by created", feed["id"])}}

def action_filters_remove(a):
	feed = filters_feed(a)
	if not feed:
		return
	if not mochi.db.exists("select 1 from filters where id=? and feed=?", a.input("filter"), feed["id"]):
		a.error.label(404, "errors.filter_not_found")
		return
	mochi.db.execute("delete from filters where id=? and feed=?", a.input("filter"), feed["id"])
	return {"data": {"filters": mochi.db.rows("select id, phrase, created from filters where feed=? order by created", feed["id"])}}

# === Importing a follow list ===

def import_addresses(text):
	"""The addresses in a Mastodon export of follows (following_accounts.csv:
	"Account address,Show boosts,Notify on new posts,Languages"), or one
	address a line."""
	addresses = []
	seen = {}
	for line in text.replace("\r", "").split("\n"):
		field = line.split(",", 1)[0].strip().strip('"')
		if not field or field.lower() == "account address" or " " in field:
			continue
		if field not in seen:
			seen[field] = True
			addresses.append(field)
		if len(addresses) >= IMPORT_ADDRESSES_MAXIMUM:
			break
	return addresses

def action_sources_import(a):
	"""Follow everyone in a Mastodon export of follows into the feed, as
	sources: the first within this request's budget, the rest in scheduled
	steps. Answers how many were added so far and whether more follow."""
	if not a.user:
		a.error.label(401, "errors.not_logged_in")
		return
	feed = get_feed(a)
	if not feed or not is_feed_owner(a.user.identity.id, feed):
		a.error.label(403, "errors.access_denied")
		return
	addresses = import_addresses(a.input("addresses") or "")
	if not addresses:
		a.error.label(400, "errors.no_addresses")
		return
	acc = follow_account(a.input("account", ""))
	import_id = mochi.uid()
	mochi.db.execute("insert into imports (id, feed, account, addresses, position, created) values (?, ?, ?, ?, 0, ?)", import_id, feed["id"], acc["id"] if acc else "", json.encode(addresses), mochi.time.now())
	count, more = import_file_step(import_id, a.user.identity.id)
	return {"data": {"imported": count, "more": more, "total": len(addresses)}}

def import_file_step(import_id, user_id):
	"""A step of a follow list import: the addresses from where the last step
	stopped, each a source, until the step's budget is spent; the next step
	is booked for the rest. Answers (count, more)."""
	row = mochi.db.row("select * from imports where id=?", import_id)
	if not row:
		return (0, False)
	feed = mochi.db.row("select * from feeds where id=?", row["feed"])
	addresses = json.decode(row["addresses"], None) or []
	if not feed or type(addresses) != "list":
		mochi.db.execute("delete from imports where id=?", import_id)
		return (0, False)
	acc = publish_account(row["account"]) if row["account"] else None
	deadline = mochi.time.now() + FOLLOWS_BUDGET
	count = 0
	position = row["position"]
	while position < len(addresses):
		if mochi.time.now() >= deadline:
			mochi.db.execute("update imports set position=? where id=?", position, import_id)
			mochi.schedule.after("schedule_import", {"feed": feed["id"], "kind": "file", "import": import_id}, 2)
			return (count, True)
		if follow_source(feed, {"network": "fediverse", "identifier": str(addresses[position]), "name": ""}, user_id, acc):
			count += 1
		position += 1
	mochi.db.execute("delete from imports where id=?", import_id)
	return (count, False)

# === People the user knows ===

def action_people(a):
	"""The user's contacts with a handle on another network, for the search
	page to offer as people to follow: each with whether a feed follows them
	already."""
	if not a.user or not a.user.identity or not a.user.identity.id:
		a.error.label(401, "errors.not_logged_in")
		return
	people = mochi.service.call("people", "handles") or []
	out = []
	for person in people:
		if type(person) != "dict":
			continue
		identifier = str(person.get("id", "") or "")
		followed = bool(identifier) and mochi.db.exists("select 1 from sources where type='person/posts' and url=?", identifier)
		if not followed and person.get("handle"):
			followed = mochi.db.exists("select 1 from sources where type='rss' and name=?", str(person.get("name", "")))
		entry = dict(person)
		entry["followed"] = followed
		out.append(entry)
	return {"data": {"people": out}}
