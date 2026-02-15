# Mochi Feeds app
# Copyright Alistair Cunningham 2024-2025

# Helper: Strip HTML tags and decode common entities
def strip_html(text):
	if not text:
		return ""
	result = []
	in_tag = False
	for c in text.elems():
		if c == "<":
			in_tag = True
		elif c == ">":
			in_tag = False
		elif not in_tag:
			result.append(c)
	out = "".join(result)
	# Decode common HTML entities
	out = out.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
	out = out.replace("&quot;", "\"").replace("&#39;", "'").replace("&apos;", "'")
	out = out.replace("&#038;", "&").replace("&nbsp;", " ")
	# Collapse multiple blank lines into at most two newlines
	while "\n\n\n" in out:
		out = out.replace("\n\n\n", "\n\n")
	return out.strip()

# Helper: Get feed from request input, validating it exists
def get_feed(a):
    feed = a.input("feed")
    if not feed:
        return None
    row = mochi.db.row("select * from feeds where id=?", feed)
    if not row:
        # Try to find by fingerprint - check all feeds
        rows = mochi.db.rows("select * from feeds")
        for r in rows:
            if mochi.entity.fingerprint(r["id"]) == feed or mochi.entity.fingerprint(r["id"], True) == feed:
                return r
    if row:
        return row

    return None

# Access level hierarchy: comment > react > view
# Each level grants access to that operation and all operations below it.
# "none" explicitly blocks all access (stored as deny rules for all levels).
ACCESS_LEVELS = ["view", "react", "comment"]

# Helper: Check if current user has access to perform an operation
# Uses hierarchical access levels: comment grants react+view, react grants view.
# Users with "manage" or "*" permission automatically have all permissions.
# Subscribers get implicit view/react/comment access.
def check_access(a, feed_id, operation):
    resource = "feed/" + feed_id
    user = None
    if a.user and a.user.identity:
        user = a.user.identity.id

    # Manage or wildcard grants full access
    if mochi.access.check(user, resource, "manage") or mochi.access.check(user, resource, "*"):
        return True

    # For hierarchical levels, check if user has the required level or higher
    # ACCESS_LEVELS is ordered lowest to highest: ["view", "react", "comment"]
    # So we check from the operation's index to the end (higher levels)
    if operation in ACCESS_LEVELS:
        op_index = ACCESS_LEVELS.index(operation)
        for level in ACCESS_LEVELS[op_index:]:
            if mochi.access.check(user, resource, level):
                return True

    # Subscribers get implicit access to view/react/comment
    if operation in ["view", "react", "comment"] and user:
        if mochi.db.exists("select 1 from subscribers where feed=? and id=?", feed_id, user):
            return True

    return False

# Helper: Check if remote user (from event header) has access to perform an operation
# Uses same hierarchical levels as check_access.
# Subscribers get implicit view/react/comment access.
def check_event_access(user_id, feed_id, operation):
    resource = "feed/" + feed_id

    # Manage or wildcard grants full access
    if mochi.access.check(user_id, resource, "manage") or mochi.access.check(user_id, resource, "*"):
        return True

    # For hierarchical levels, check if user has the required level or higher
    # ACCESS_LEVELS is ordered lowest to highest: ["view", "react", "comment"]
    # So we check from the operation's index to the end (higher levels)
    if operation in ACCESS_LEVELS:
        op_index = ACCESS_LEVELS.index(operation)
        for level in ACCESS_LEVELS[op_index:]:
            if mochi.access.check(user_id, resource, level):
                return True

    # Subscribers get implicit access to view/react/comment
    if operation in ["view", "react", "comment"] and user_id:
        if mochi.db.exists("select 1 from subscribers where feed=? and id=?", feed_id, user_id):
            return True

    return False

# Helper: Broadcast event to all subscribers of a feed
def broadcast_event(feed_id, event, data, exclude=None):
    if not feed_id:
        return
    subscribers = mochi.db.rows("select id from subscribers where feed=?", feed_id)
    for sub in subscribers:
        if exclude and sub["id"] == exclude:
            continue
        mochi.message.send(
            {"from": feed_id, "to": sub["id"], "service": "feeds", "event": event},
            data
        )

# Helper: Broadcast WebSocket notification to feed subscribers
# Uses fingerprint as key since that's what frontend connects with (from URL)
def broadcast_websocket(feed_id, data):
    if not feed_id:
        return
    
    # Get the feed fingerprint - frontend WebSocket connects with this key
    fingerprint = mochi.entity.fingerprint(feed_id)
    if not fingerprint:
        return
    
    # Write to fingerprint key only (matches frontend connection)
    mochi.websocket.write(fingerprint, data)

def feed_by_id(user_id, feed_id):
	feed_data = mochi.db.row("select * from feeds where id=?", feed_id)
	if not feed_data:
		# Try to find by fingerprint - scan all feeds
		feeds = mochi.db.rows("select * from feeds")
		for f in feeds:
			fp = mochi.entity.fingerprint(f["id"])
			if fp == feed_id or fp == feed_id.replace("-", ""):
				feed_data = f
				break

	if not feed_data:
		mochi.log.info("feed_by_id: not found by fingerprint '%s' either", feed_id)
		return None

	if user_id != None:
		feed_data["entity"] = mochi.entity.get(feed_data.get("id"))

	return feed_data

# Helper: Resolve a feed ID (which might be a fingerprint) to an entity ID
# Returns the entity ID if found, otherwise returns the original input
def resolve_feed_id(feed_id):
	if not feed_id:
		return None
	
	# If it's already a valid entity ID, return it
	if mochi.valid(feed_id, "entity"):
		return feed_id
	
	# If it's a fingerprint, try to resolve via directory
	if mochi.valid(feed_id, "fingerprint"):
		# Search directory by fingerprint
		fingerprint = feed_id.replace("-", "")
		all_feeds = mochi.directory.search("feed", "", False)
		for entry in all_feeds:
			entry_fp = entry.get("fingerprint", "").replace("-", "")
			if entry_fp == fingerprint:
				mochi.log.info("resolve_feed_id: resolved fingerprint %s to entity %s (directory)", feed_id, entry.get("id"))
				return entry.get("id")
		
		# If not in directory, check local subscriptions (for private/unlisted feeds)
		subs = mochi.db.rows("select feed from subscribers")
		for sub in subs:
			if mochi.entity.fingerprint(sub["feed"]) == feed_id:
				mochi.log.info("resolve_feed_id: resolved fingerprint %s to entity %s (subscription)", feed_id, sub["feed"])
				return sub["feed"]
				
		mochi.log.info("resolve_feed_id: could not resolve fingerprint %s in directory or subscriptions", feed_id)
	
	# Could not resolve - return original
	mochi.log.info("resolve_feed_id: returning original input %s", feed_id)
	return feed_id

def feed_comments(user_id, post_data, parent_id, depth):
	if (depth > 1000):
		return None

	if parent_id == None:
		parent_id = ""

	comments = mochi.db.rows("select * from comments where post=? and parent=? order by created desc", post_data["id"], parent_id)
	for i in range(len(comments)):
		comments[i]["feed_fingerprint"] = mochi.entity.fingerprint(comments[i]["feed"])
		if comments[i].get("format", "markdown") == "markdown":
			comments[i]["body_markdown"] = mochi.markdown.render(comments[i]["body"])
		comments[i]["user"] = user_id or ""
		comments[i]["attachments"] = mochi.attachment.list(comments[i]["id"], comments[i]["feed"])

		my_reaction = mochi.db.row("select reaction from reactions where comment=? and subscriber=?", comments[i]["id"], user_id)
		comments[i]["my_reaction"] = my_reaction["reaction"] if my_reaction else ""

		comments[i]["reactions"] = mochi.db.rows("select * from reactions where comment=? and subscriber!=? and reaction!='' order by name", comments[i]["id"], user_id)

		comments[i]["children"] = feed_comments(user_id, post_data, comments[i]["id"], depth + 1)

	return comments

def is_reaction_valid(reaction):
	# "none" or empty means remove reaction
	if not reaction or reaction == "none":
		return {"valid": True, "reaction": ""}
	if mochi.valid(reaction, "^(like|dislike|laugh|amazed|love|sad|angry|agree|disagree)$"):
		return {"valid": True, "reaction": reaction}
	return {"valid": False, "reaction": ""}

def feed_update(user_id, feed_data):
	feed_id = feed_data["id"]
	# Use atomic subquery to avoid race condition
	mochi.db.execute("update feeds set subscribers=(select count(*) from subscribers where feed=? and system=0), updated=? where id=?", feed_id, mochi.time.now(), feed_id)

	# Get current subscriber count and list for notifications
	subscribers = mochi.db.rows("select * from subscribers where feed=?", feed_id)
	subscriber_count = len(subscribers)

	for sub in subscribers:
		subscriber_id = sub["id"]
		if subscriber_id == user_id:
			continue
		if not subscriber_id:
			continue
		mochi.message.send(
			headers(feed_id, subscriber_id, "update"),
			{"subscribers": subscriber_count}
		)

# Send recent posts to a new subscriber
# Batches database queries to avoid N+1 pattern
def send_recent_posts(user_id, feed_data, subscriber_id):
	feed_id = feed_data["id"]
	feed_posts = mochi.db.rows("select * from posts where feed=? order by created desc limit 1000", feed_id)
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

	# Send posts with their comments and reactions
	for post in feed_posts:
		post_id = post["id"]
		post["sync"] = True
		post["attachments"] = mochi.attachment.list(post_id)
		mochi.message.send(headers(feed_id, subscriber_id, "post/create"), post)

		# Send comments for this post
		for c in comments_by_post.get(post_id, []):
			c["sync"] = True
			c["attachments"] = mochi.attachment.list(c["id"])
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

def is_feed_owner(user_id, feed_data):
	if feed_data == None:
		return False
	return feed_data.get("owner") == 1

# Helper: Check if user is subscribed to a feed
def is_user_subscribed(user_id, feed_entity_id):
	if not user_id or not feed_entity_id:
		return False
	return mochi.db.exists("select 1 from subscribers where feed=? and id=?", feed_entity_id, user_id)

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

# Helper: Get post sort order based on sort type
def get_post_order(sort):
	if sort == "top":
		return "(up - down) desc, created desc"
	if sort == "hot" or sort == "best":
		# score / (age_in_hours + 2)
		# Use max(..., 1) to prevent divide by zero if created time is in the future due to clock skew
		return "((up - down) + 1) / max(((" + str(mochi.time.now()) + " - created) / 3600) + 2, 1) desc, created desc"
	if sort == "rising":
		# Rising focuses on newer content with rapid growth
		return "((up - down) + 1) / max(((" + str(mochi.time.now()) + " - created) / 1800) + 2, 1) desc, created desc"
	# Default is "new"
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
	
# Create database
def database_create():
	mochi.db.execute("create table if not exists feeds ( id text not null primary key, name text not null, privacy text not null default 'public', owner integer not null default 0, subscribers integer not null default 0, updated integer not null, server text not null default '', memories text not null default '' )")
	mochi.db.execute("create index if not exists feeds_name on feeds( name )")
	mochi.db.execute("create index if not exists feeds_updated on feeds( updated )")

	mochi.db.execute("create table if not exists subscribers ( feed references feeds( id ), id text not null, name text not null default '', system integer not null default 0, primary key ( feed, id ) )")
	mochi.db.execute("create index if not exists subscriber_id on subscribers( id )")

	mochi.db.execute("create table if not exists posts ( id text not null primary key, feed references feeds( id ), body text not null, data text not null default '', format text not null default 'markdown', created integer not null, updated integer not null, edited integer not null default 0, up integer not null default 0, down integer not null default 0 )")
	mochi.db.execute("create index if not exists posts_feed on posts( feed )")
	mochi.db.execute("create index if not exists posts_created on posts( created )")
	mochi.db.execute("create index if not exists posts_updated on posts( updated )")

	mochi.db.execute("create table if not exists comments ( id text not null primary key, feed references feeds( id ), post references posts( id ), parent text not null, subscriber text not null, name text not null, body text not null, format text not null default 'markdown', created integer not null, edited integer not null default 0 )")
	mochi.db.execute("create index if not exists comments_feed on comments( feed )")
	mochi.db.execute("create index if not exists comments_post on comments( post )")
	mochi.db.execute("create index if not exists comments_parent on comments( parent )")
	mochi.db.execute("create index if not exists comments_created on comments( created )")

	mochi.db.execute("create table if not exists reactions ( feed references feeds( id ), post references posts( id ), comment text not null default '', subscriber text not null, name text not null, reaction text not null default '', primary key ( feed, post, comment, subscriber ) )")
	mochi.db.execute("create index if not exists reactions_post on reactions( post )")
	mochi.db.execute("create index if not exists reactions_comment on reactions( comment )")

	mochi.db.execute("create table if not exists rss ( token text not null primary key, entity text not null, mode text not null, created integer not null, unique(entity, mode) )")
	mochi.db.execute("create index if not exists rss_entity on rss( entity )")

	mochi.db.execute("create table if not exists sources ( id text not null primary key, feed references feeds( id ), type text not null, url text not null, name text not null default '', reliability integer not null default 100, base integer not null default 900, max integer not null default 86400, interval integer not null default 900, next integer not null default 0, jitter integer not null default 60, changed integer not null default 0, etag text not null default '', modified text not null default '', ttl integer not null default 0, fetched integer not null default 0 )")
	mochi.db.execute("create index if not exists sources_feed on sources( feed )")
	mochi.db.execute("create index if not exists sources_next on sources( next )")
	mochi.db.execute("create index if not exists sources_type on sources( type )")

	mochi.db.execute("create table if not exists source_posts ( source text not null references sources( id ), post text not null references posts( id ), guid text not null default '', primary key ( source, post ) )")
	mochi.db.execute("create index if not exists source_posts_guid on source_posts( guid )")
	mochi.db.execute("create index if not exists source_posts_post on source_posts( post )")


# Upgrade database schema
def database_upgrade(to_version):
	if to_version == 2:
		# Add privacy and owner columns if they don't exist
		columns = mochi.db.rows("pragma table_info(feeds)")
		has_privacy = False
		has_owner = False
		for col in columns:
			if col["name"] == "privacy":
				has_privacy = True
			if col["name"] == "owner":
				has_owner = True

		if not has_privacy:
			mochi.db.execute("alter table feeds add column privacy text not null default 'public'")
		if not has_owner:
			mochi.db.execute("alter table feeds add column owner integer not null default 0")

	if to_version == 3:
		# Add server column for remote feeds
		columns = mochi.db.rows("pragma table_info(feeds)")
		has_server = False
		for col in columns:
			if col["name"] == "server":
				has_server = True
		if not has_server:
			mochi.db.execute("alter table feeds add column server text not null default ''")

	if to_version == 4:
		# Add edited column to posts and comments for edit tracking
		posts_cols = mochi.db.rows("pragma table_info(posts)")
		has_edited = False
		for col in posts_cols:
			if col["name"] == "edited":
				has_edited = True
		if not has_edited:
			mochi.db.execute("alter table posts add column edited integer not null default 0")

		comments_cols = mochi.db.rows("pragma table_info(comments)")
		has_edited = False
		for col in comments_cols:
			if col["name"] == "edited":
				has_edited = True
		if not has_edited:
			mochi.db.execute("alter table comments add column edited integer not null default 0")

	if to_version == 5:
		# Add data column for extended post features (checkin, travelling, etc.)
		mochi.db.execute("alter table posts add column data text not null default ''")

	if to_version == 6:
		# Previously ran but mochi.entity.info() didn't include creator
		# Re-run in version 7
		pass

	if to_version == 7:
		# Add explicit owner access rules for existing feeds
		feeds = mochi.db.rows("select id from feeds where owner=1")
		for feed in feeds:
			feed_id = feed["id"]
			resource = "feed/" + feed_id
			entity = mochi.entity.info(feed_id)
			owner_id = entity.get("creator") if entity else None
			if owner_id:
				mochi.access.allow(owner_id, resource, "*", owner_id)

	if to_version == 8:
		# Remove fingerprint column - fingerprints are computed from entity ID
		# SQLite doesn't support DROP COLUMN, so recreate the table
		mochi.db.execute("create table feeds_new ( id text not null primary key, name text not null, privacy text not null default 'public', owner integer not null default 0, subscribers integer not null default 0, updated integer not null, server text not null default '' )")
		mochi.db.execute("insert into feeds_new (id, name, privacy, owner, subscribers, updated, server) select id, name, privacy, owner, subscribers, updated, server from feeds")
		mochi.db.execute("drop table feeds")
		mochi.db.execute("alter table feeds_new rename to feeds")
		mochi.db.execute("create index if not exists feeds_name on feeds( name )")
		mochi.db.execute("create index if not exists feeds_updated on feeds( updated )")

	if to_version == 10:
		pass

	if to_version == 11:
		# Remove unused settings table and create bookmarks table
		mochi.db.execute("drop table if exists settings")
		mochi.db.execute("create table if not exists bookmarks (id text primary key, name text not null, server text not null default '', added integer not null)")
		mochi.db.execute("create index if not exists bookmarks_added on bookmarks(added)")

	if to_version == 12:
		# Add up/down score columns to posts for efficient sorting
		mochi.db.execute("alter table posts add column up integer not null default 0")
		mochi.db.execute("alter table posts add column down integer not null default 0")

	if to_version == 13:
		# Add RSS token table
		mochi.db.execute("create table if not exists rss ( token text not null primary key, entity text not null, mode text not null, created integer not null, unique(entity, mode) )")
		mochi.db.execute("create index if not exists rss_entity on rss( entity )")

	if to_version == 14:
		# Re-add up/down columns if migration 12 failed (version bumped on error)
		columns = mochi.db.rows("pragma table_info(posts)")
		has_up = False
		for col in columns:
			if col["name"] == "up":
				has_up = True
		if not has_up:
			mochi.db.execute("alter table posts add column up integer not null default 0")
			mochi.db.execute("alter table posts add column down integer not null default 0")

	if to_version == 15:
		# Add sources and source_posts tables for feed source aggregation
		mochi.db.execute("create table if not exists sources ( id text not null primary key, feed references feeds( id ), type text not null, url text not null, name text not null default '', reliability integer not null default 100, base integer not null default 900, max integer not null default 86400, interval integer not null default 900, next integer not null default 0, jitter integer not null default 60, changed integer not null default 0, etag text not null default '', modified text not null default '', ttl integer not null default 0, fetched integer not null default 0 )")
		mochi.db.execute("create index if not exists sources_feed on sources( feed )")
		mochi.db.execute("create index if not exists sources_next on sources( next )")
		mochi.db.execute("create index if not exists sources_type on sources( type )")

		mochi.db.execute("create table if not exists source_posts ( source text not null references sources( id ), post text not null references posts( id ), guid text not null default '', primary key ( source, post ) )")
		mochi.db.execute("create index if not exists source_posts_guid on source_posts( guid )")
		mochi.db.execute("create index if not exists source_posts_post on source_posts( post )")

		# Add system column to subscribers for system subscriptions (source feeds)
		mochi.db.execute("alter table subscribers add column system integer not null default 0")

		# Add memories column to feeds for future use
		mochi.db.execute("alter table feeds add column memories text not null default ''")

	if to_version == 16:
		# Add format column to posts and comments for content type tracking
		mochi.db.execute("alter table posts add column format text not null default 'markdown'")
		mochi.db.execute("alter table comments add column format text not null default 'markdown'")
		# Mark existing source posts as plain text
		mochi.db.execute("update posts set format='text' where id in (select post from source_posts)")

# ACTIONS

# Info endpoint for class context - returns list of feeds
def action_info_class(a):
    user_id = a.user.identity.id if a.user else None
    
    if user_id:
        # Return feeds the user owns or is subscribed to
        # Strategy: Start with subscribed feeds (from subscribers table), then add owned feeds
        
        seen_feed_ids = set()
        user_feeds = []
        
        # Get owned feeds first, then subscribed feeds, deduplicate
        owned_feeds = mochi.db.rows("select * from feeds where owner=1 order by updated desc")
        for feed in owned_feeds:
            feed["fingerprint"] = mochi.entity.fingerprint(feed["id"])
            feed["isSubscribed"] = False
            user_feeds.append(feed)
            seen_feed_ids.add(feed["id"])

        subscriptions = mochi.db.rows("""
            select f.* from feeds f
            inner join subscribers s on f.id=s.feed
            where s.id=?
            order by f.updated desc
        """, user_id)
        for feed in subscriptions:
            if feed["id"] not in seen_feed_ids:
                feed["fingerprint"] = mochi.entity.fingerprint(feed["id"])
                feed["isSubscribed"] = True
                user_feeds.append(feed)
                seen_feed_ids.add(feed["id"])
        
        # Sort by updated desc - use bubble sort since Starlark lists don't have .sort()
        feed_list = []
        for feed in user_feeds:
            feed_list.append({"feed": feed, "updated": feed.get("updated", 0)})
        
        # Bubble sort by updated desc
        n = len(feed_list)
        for i in range(n):
            for j in range(0, n - i - 1):
                if feed_list[j]["updated"] < feed_list[j + 1]["updated"]:
                    # Swap
                    temp = feed_list[j]
                    feed_list[j] = feed_list[j + 1]
                    feed_list[j + 1] = temp
        
        feeds = [item["feed"] for item in feed_list]
    else:
        # Not logged in - return empty list
        feeds = []
    
    return {"data": {"entity": False, "feeds": feeds, "user_id": user_id}}

# Info endpoint for entity context - returns feed info with permissions
def action_info_entity(a):
    feed = get_feed(a)
    if not feed:
        a.error(404, "Feed not found")
        return

    user_id = a.user.identity.id if a.user else None
    feed_entity_id = feed.get("id")

    # Check if this is a remote feed (subscription without local ownership)
    is_remote = feed.get("owner") != 1
    server = feed.get("server", "")

    if is_remote:
        # Fetch live info from remote server
        peer = mochi.remote.peer(server) if server and server.startswith("http") else None
        response = mochi.remote.request(feed_entity_id, "feeds", "info", {"feed": feed_entity_id}, peer)
        if not response.get("error"):
            remote_data = response.get("data", response)
            remote_feed = remote_data.get("feed", remote_data)
            remote_feed["fingerprint"] = mochi.entity.fingerprint(feed_entity_id)
            remote_feed["owner"] = 0
            remote_feed["isSubscribed"] = is_user_subscribed(user_id, feed_entity_id) if user_id else False
            remote_feed["server"] = server
            return {"data": {
                "entity": True,
                "feed": remote_feed,
                "permissions": remote_data.get("permissions", {"view": True, "react": False, "comment": False, "manage": False}),
                "fingerprint": mochi.entity.fingerprint(feed_entity_id, True),
                "user_id": user_id,
            }}

        # Fall back to cached data if remote is unavailable
        feed["fingerprint"] = mochi.entity.fingerprint(feed_entity_id)
        feed["owner"] = 0
        feed["isSubscribed"] = is_user_subscribed(user_id, feed_entity_id) if user_id else False
        return {"data": {
            "entity": True,
            "feed": feed,
            "permissions": {"view": True, "react": False, "comment": False, "manage": False},
            "fingerprint": mochi.entity.fingerprint(feed_entity_id, True),
            "user_id": user_id,
        }}

    if not check_access(a, feed["id"], "view"):
        a.error(403, "Access denied")
        return

    # Local feed - owned by this server
    feed["fingerprint"] = mochi.entity.fingerprint(feed_entity_id)
    feed["owner"] = 1
    feed["isSubscribed"] = False  # Owners don't need subscription

    # Determine permissions for current user
    can_manage = check_access(a, feed_entity_id, "manage") if a.user else False
    permissions = {
        "view": True,
        "react": can_manage or check_access(a, feed_entity_id, "react") or check_access(a, feed_entity_id, "comment"),
        "comment": can_manage or check_access(a, feed_entity_id, "comment"),
        "manage": can_manage,
    } if a.user else {"view": True, "react": False, "comment": False, "manage": False}

    fp = mochi.entity.fingerprint(feed_entity_id, True)
    return {"data": {
        "entity": True,
        "feed": feed,
        "permissions": permissions,
        "fingerprint": fp,
        "user_id": user_id
    }}

def action_view(a):
	feed_id = a.input("feed")
	user_id = a.user.identity.id if a.user else None
	server = a.input("server")

	# Get local feed data if available
	feed_data = None
	if type(feed_id) == type("") and (mochi.valid(feed_id, "entity") or mochi.valid(feed_id, "fingerprint")):
		feed_data = feed_by_id(user_id, feed_id)

	# Determine if we need to fetch remotely
	# Remote if: specific feed requested AND (not local OR local but not owner)
	# Note: Subscribed feeds must fetch from owner since P2P sync doesn't work reliably
	is_remote = False
	if feed_id and feed_data:
		if feed_data.get("owner") != 1:
			is_remote = True
			if not server:
				server = feed_data.get("server", "")
	elif feed_id and not feed_data:
		# Unknown feed - treat as remote
		is_remote = True

	# For remote feeds, fetch via P2P
	if is_remote and feed_id:
		return view_remote(a, user_id, feed_id, server, feed_data)

	# Local feed handling
	if user_id == None and feed_data == None:
		a.error(404, "No feed specified")
		return

	# Check access to specific feed
	if feed_data:
		if not check_access(a, feed_data["id"], "view"):
			a.error(403, "Not authorized to view this feed")
			return

	post_id = a.input("post")

	# Pagination parameters
	limit_str = a.input("limit")
	before_str = a.input("before")
	sort = a.input("sort") or "new"
	limit = 20
	if limit_str and mochi.valid(limit_str, "natural"):
		limit = min(int(limit_str), 100)
	before = None
	if before_str and mochi.valid(before_str, "natural"):
		before = int(before_str)

	# Get posts order
	order_by = get_post_order(sort)

	if post_id:
		# Verify post belongs to an accessible feed
		post_feed = mochi.db.row("select feed from posts where id=?", post_id)
		if post_feed:
			pf_data = feed_by_id(user_id, post_feed["feed"])
			if pf_data and not check_access(a, pf_data["id"], "view"):
				a.error(403, "Not authorized to view this post")
				return
		posts = mochi.db.rows("select * from posts where id=?", post_id)
	elif feed_data:
		if before:
			posts = mochi.db.rows("select * from posts where feed=? and created<? order by " + order_by + " limit ?", feed_data["id"], before, limit + 1)
		else:
			posts = mochi.db.rows("select * from posts where feed=? order by " + order_by + " limit ?", feed_data["id"], limit + 1)
	else:
		# Only show posts from feeds the user is subscribed to or owns
		if before:
			posts = mochi.db.rows("select p.* from posts p inner join subscribers s on p.feed = s.feed where s.id = ? and p.created<? order by p." + order_by.replace("created", "p.created") + " limit ?", user_id, before, limit + 1)
		else:
			posts = mochi.db.rows("select p.* from posts p inner join subscribers s on p.feed = s.feed where s.id = ? order by p." + order_by.replace("created", "p.created") + " limit ?", user_id, limit + 1)

	# Check if there are more posts (we fetched limit+1)
	has_more = len(posts) > limit
	if has_more:
		posts = posts[:limit]

	for i in range(len(posts)):
		fd = mochi.db.row("select name from feeds where id=?", posts[i]["feed"])
		if fd:
			posts[i]["feed_fingerprint"] = mochi.entity.fingerprint(posts[i]["feed"])
			posts[i]["feed_name"] = fd["name"]

		posts[i]["attachments"] = mochi.attachment.list(posts[i]["id"], posts[i]["feed"])

		# Parse extended data if present
		if posts[i].get("data"):
			posts[i]["data"] = json.decode(posts[i]["data"])
		else:
			posts[i]["data"] = {}

		my_reaction = mochi.db.row("select reaction from reactions where post=? and subscriber=? and comment=?", posts[i]["id"], user_id, "")
		posts[i]["my_reaction"] = my_reaction["reaction"] if my_reaction else ""
		posts[i]["reactions"] = mochi.db.rows("select * from reactions where post=? and comment='' and subscriber!=? and reaction!='' order by name", posts[i]["id"], user_id)
		posts[i]["comments"] = feed_comments(user_id, posts[i], None, 0)

		# Add source attribution if post came from a source
		source_post = mochi.db.row("select s.name, s.url, s.type from source_posts sp join sources s on sp.source = s.id where sp.post=?", posts[i]["id"])
		if source_post:
			posts[i]["source"] = {"name": source_post["name"], "url": source_post["url"], "type": source_post["type"]}

		# Render markdown for markdown-format posts
		if posts[i].get("format", "markdown") == "markdown":
			posts[i]["body_markdown"] = mochi.markdown.render(posts[i]["body"])

	is_owner = is_feed_owner(user_id, feed_data)
	
	# Add isSubscribed and fingerprint fields
	if feed_data:
		feed_entity_id = feed_data.get("id")
		feed_data["fingerprint"] = mochi.entity.fingerprint(feed_entity_id)
		if feed_data.get("owner") == 1:
			feed_data["isSubscribed"] = False
		elif user_id and feed_entity_id:
			feed_data["isSubscribed"] = is_user_subscribed(user_id, feed_entity_id)
		else:
			feed_data["isSubscribed"] = False
	
	# Get feeds - filter to only feeds user owns or is subscribed to
	if user_id:
		# Get all feeds the user is subscribed to
		subscribed_feeds = mochi.db.rows("""
			select f.* from feeds f
			inner join subscribers s on f.id = s.feed
			where s.id = ?
			order by f.updated desc
		""", user_id)
		
		# Get owned and subscribed feeds, deduplicate
		owned_feeds = mochi.db.rows("select * from feeds where owner=1 order by updated desc")
		seen_feed_ids = set()
		user_feeds = []
		for feed in owned_feeds:
			feed["fingerprint"] = mochi.entity.fingerprint(feed["id"])
			feed["isSubscribed"] = False
			user_feeds.append(feed)
			seen_feed_ids.add(feed["id"])
		for feed in subscribed_feeds:
			if feed["id"] not in seen_feed_ids:
				feed["fingerprint"] = mochi.entity.fingerprint(feed["id"])
				feed["isSubscribed"] = is_user_subscribed(user_id, feed["id"])
				user_feeds.append(feed)
				seen_feed_ids.add(feed["id"])

		# Sort by updated desc
		feed_list = []
		for feed in user_feeds:
			feed_list.append({"feed": feed, "updated": feed.get("updated", 0)})
		
		# Bubble sort by updated desc
		n = len(feed_list)
		for i in range(n):
			for j in range(0, n - i - 1):
				if feed_list[j]["updated"] < feed_list[j + 1]["updated"]:
					# Swap
					temp = feed_list[j]
					feed_list[j] = feed_list[j + 1]
					feed_list[j + 1] = temp
		
		feeds = [item["feed"] for item in feed_list]
	else:
		# Not logged in - return empty list
		feeds = []

	next_cursor = None
	if has_more and len(posts) > 0:
		next_cursor = posts[-1]["created"]

	# Determine permissions for current user
	permissions = None
	if feed_data and user_id:
		feed_entity_id = feed_data.get("id")
		can_manage = check_access(a, feed_entity_id, "manage") or is_owner
		is_public = feed_data.get("privacy", "public") == "public"
		# Use helper function to check subscription - ensures correct entity ID is used
		is_subscriber = is_user_subscribed(user_id, feed_entity_id) if feed_entity_id else False
		
		# Subscribers and public feed viewers can react/comment
		can_react = can_manage or check_access(a, feed_entity_id, "react") or is_subscriber or is_public
		can_comment = can_manage or check_access(a, feed_entity_id, "comment") or is_subscriber or is_public
		
		permissions = {
			"view": True,
			"react": can_react,
			"comment": can_comment,
			"manage": can_manage,
		}
	
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

	return {
		"data": {
			"feed": feed_data,
			"posts": posts,
			"feeds": feeds,
			"owner": is_owner,
			"user": user_id,
			"hasMore": has_more,
			"nextCursor": next_cursor,
			"permissions": permissions
		}
	}

# Helper: Fetch posts from remote feed via P2P
# Helper: Fetch posts from remote feed via P2P
def view_remote(a, user_id, feed_id, server, local_feed):
	if not user_id:
		a.error(401, "Not logged in")
		return
	
	# Resolve feed_id to entity ID if it's a fingerprint
	# Use local_feed if available (has proper entity ID), otherwise resolve via directory
	if local_feed:
		feed_id = local_feed["id"]
	elif mochi.valid(feed_id, "fingerprint"):
		resolved_id = resolve_feed_id(feed_id)
		if resolved_id and mochi.valid(resolved_id, "entity"):
			feed_id = resolved_id
	
	# Resolve server URL to peer, or use directory lookup if no server
	peer = None
	if server:
		peer = mochi.remote.peer(server)
		if not peer:
			a.error(502, "Unable to connect to server")
			return
			
	# Check local subscription status - trust local source of truth
	is_subscriber_locally = mochi.db.exists("select 1 from subscribers where feed=? and id=?", feed_id, user_id)
	
	# If no peer, mochi.remote.request will use directory lookup
	response = mochi.remote.request(feed_id, "feeds", "view", {"feed": feed_id}, peer)
	if response.get("error"):
		a.error(response.get("code", 500), response["error"])
		return

	# Remote action_view returns {"data": {...}}, so unwrap it
	# Fall back to response itself if data key is missing (for compatibility)
	remote_data = response.get("data", response)
	remote_feed = remote_data.get("feed", {})
	
	feed_name = remote_feed.get("name", "")
	feed_fingerprint = remote_feed.get("fingerprint", mochi.entity.fingerprint(feed_id))
	feed_privacy = remote_feed.get("privacy", "public")
	remote_permissions = remote_data.get("permissions")
	posts = remote_data.get("posts", [])
	
	# NOTE: We trust remote_permissions from the server now. The server's check_event_access
	# correctly handles ACLs including "+" (Authenticated users). No client override needed.
	
	# FALLBACK: If remote returned NO posts, try local replica
	if len(posts) == 0 and is_subscriber_locally:
		limit = 20
		posts = mochi.db.rows("select * from posts where feed=? order by created desc limit ?", feed_id, limit + 1)
		
		# Process local posts same as action_view
		for i in range(len(posts)):
			if posts[i].get("format", "markdown") == "markdown":
				posts[i]["body_markdown"] = mochi.markdown.render(posts[i]["body"])
			posts[i]["attachments"] = mochi.attachment.list(posts[i]["id"], posts[i]["feed"])
			if posts[i].get("data"):
				posts[i]["data"] = json.decode(posts[i]["data"])
			else:
				posts[i]["data"] = {}
			
			# Get reactions/comments for local posts (since they are local)
			posts[i]["reactions"] = mochi.db.rows("select * from reactions where post=? and comment='' and subscriber!=? and reaction!='' order by name", posts[i]["id"], user_id)
			posts[i]["comments"] = feed_comments(user_id, posts[i], None, 0)

	# Add local user's reactions to posts (whether from remote or local fallback)
	for i in range(len(posts)):
		my_reaction = mochi.db.row("select reaction from reactions where post=? and subscriber=? and comment=?", posts[i]["id"], user_id, "")
		posts[i]["my_reaction"] = my_reaction["reaction"] if my_reaction else ""
		
		# If posts came from remote, comments are already attached, but we need our reactions to them
		if posts[i].get("comments"):
			for j in range(len(posts[i]["comments"])):
				comment_reaction = mochi.db.row("select reaction from reactions where comment=? and subscriber=?", posts[i]["comments"][j]["id"], user_id)
				posts[i]["comments"][j]["my_reaction"] = comment_reaction["reaction"] if comment_reaction else ""
				
				# Also merge local reactions from others (like owner reactions received via P2P)
				# These may not be in the remote data yet due to timing
				local_reactions = mochi.db.rows("select * from reactions where comment=? and subscriber!=? and reaction!='' order by name", posts[i]["comments"][j]["id"], user_id)
				if local_reactions and len(local_reactions) > 0:
					# Merge with existing reactions array, avoiding duplicates
					# Convert to list if it's a tuple
					existing_reactions = posts[i]["comments"][j].get("reactions", [])
					existing_reactions_list = list(existing_reactions) if existing_reactions else []
					existing_subscriber_ids = set([r.get("subscriber") for r in existing_reactions_list])
					for local_reaction in local_reactions:
						if local_reaction["subscriber"] not in existing_subscriber_ids:
							existing_reactions_list.append(local_reaction)
					posts[i]["comments"][j]["reactions"] = existing_reactions_list

	# Return in same format as local view
	# Get feeds - filter to only feeds user owns or is subscribed to
	if user_id:
		# Get all feeds the user is subscribed to
		subscribed_feeds = mochi.db.rows("""
			select f.* from feeds f
			inner join subscribers s on f.id = s.feed
			where s.id = ?
			order by f.updated desc
		""", user_id)
		
		# Get owned and subscribed feeds, deduplicate
		owned_feeds = mochi.db.rows("select * from feeds where owner=1 order by updated desc")
		seen_feed_ids = set()
		user_feeds = []
		for feed in owned_feeds:
			feed["fingerprint"] = mochi.entity.fingerprint(feed["id"])
			feed["isSubscribed"] = False
			user_feeds.append(feed)
			seen_feed_ids.add(feed["id"])
		for feed in subscribed_feeds:
			if feed["id"] not in seen_feed_ids:
				feed["fingerprint"] = mochi.entity.fingerprint(feed["id"])
				feed["isSubscribed"] = is_user_subscribed(user_id, feed["id"])
				user_feeds.append(feed)
				seen_feed_ids.add(feed["id"])

		# Sort by updated desc
		feed_list = []
		for feed in user_feeds:
			feed_list.append({"feed": feed, "updated": feed.get("updated", 0)})
		
		# Bubble sort by updated desc
		n = len(feed_list)
		for i in range(n):
			for j in range(0, n - i - 1):
				if feed_list[j]["updated"] < feed_list[j + 1]["updated"]:
					# Swap
					temp = feed_list[j]
					feed_list[j] = feed_list[j + 1]
					feed_list[j + 1] = temp
		
		feeds = [item["feed"] for item in feed_list]
	else:
		# Not logged in - return empty list
		feeds = []
	
	# Add isSubscribed to the main feed object
	feed_is_subscribed = is_user_subscribed(user_id, feed_id) if user_id and feed_id else False
	
	# Get local feed data for accurate subscriber count
	local_feed_data = mochi.db.row("select * from feeds where id=?", feed_id)
	local_subscribers = local_feed_data.get("subscribers", 0) if local_feed_data else 0
	
	# Ensure feed_name is populated - if empty, try to get it from feeds array or local database
	if not feed_name or feed_name == "":
		# Look for the feed in the feeds array
		for feed in feeds:
			if feed.get("id") == feed_id and feed.get("name"):
				feed_name = feed.get("name")
				break
		# If still empty, try database lookup
		if not feed_name or feed_name == "":
			if local_feed_data and local_feed_data.get("name"):
				feed_name = local_feed_data.get("name")
	
	return {
		"data": {
			"feed": {
				"id": feed_id,
				"name": feed_name,
				"fingerprint": feed_fingerprint,
				"privacy": feed_privacy,
				"owner": 0,
				"subscribers": local_subscribers,
				"isSubscribed": feed_is_subscribed
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
        a.error(401, "Not logged in")
        return

    name = a.input("name")
    if not name or not mochi.valid(name, "name"):
        a.error(400, "Invalid name")
        return

    privacy = a.input("privacy") or "public"
    if privacy not in ["public", "private"]:
        a.error(400, "Invalid privacy")
        return

    # Create Mochi entity
    entity = mochi.entity.create("feed", name, privacy, "")
    if not entity:
        a.error(500, "Failed to create feed entity")
        return

    now = mochi.time.now()
    creator = a.user.identity.id

    # Store in database
    # Check if fingerprint column exists (it was removed in schema 8 but might still exist if migration failed)
    # Method 1: Check table info
    columns = mochi.db.rows("pragma table_info(feeds)")
    has_fingerprint = False
    for col in columns:
        if col["name"].lower() == "fingerprint":
            has_fingerprint = True
            break
            
    # Method 2: Check actual data (fallback if pragma fails)
    if not has_fingerprint:
        sample = mochi.db.row("select * from feeds limit 1")
        if sample and sample.get("fingerprint") != None:
            has_fingerprint = True
            
    if has_fingerprint:
        # Ensure fingerprint is not None (NOT NULL constraint)
        fp = mochi.entity.fingerprint(entity) or ""
        mochi.db.execute("insert into feeds (id, name, privacy, owner, subscribers, updated, fingerprint) values (?, ?, ?, 1, 1, ?, ?)",
            entity, name, privacy, now, fp)
    else:
        mochi.db.execute("insert into feeds (id, name, privacy, owner, subscribers, updated) values (?, ?, ?, 1, 1, ?)",
            entity, name, privacy, now)

    mochi.db.execute("insert into subscribers (feed, id, name) values (?, ?, ?)",
        entity, creator, a.user.identity.name)

    # Set up access control
    resource = "feed/" + entity
    if privacy == "public":
        # Public feeds: anyone can view, authenticated users can comment
        mochi.access.allow("*", resource, "view", creator)
        mochi.access.allow("+", resource, "comment", creator)
    # Creator gets full access
    mochi.access.allow(creator, resource, "*", creator)

    return {"data": {"id": entity, "fingerprint": mochi.entity.fingerprint(entity)}}

def action_find(a): # feeds_find
	return {"data": {}}

def action_search(a): # feeds_search
	if not a.user.identity.id:
		a.error(401, "Not logged in")
		return

	search = a.input("search")
	if not search:
		a.error(400, "No search entered")
		return

	results = []

	# Check if search term is an entity ID (49-51 word characters)
	if mochi.valid(search, "entity"):
		entry = mochi.directory.get(search)
		if entry and entry.get("class") == "feed":
			results.append(entry)

	# Check if search term is a fingerprint (9 alphanumeric, with or without hyphens)
	fingerprint = search.replace("-", "")
	if mochi.valid(fingerprint, "fingerprint"):
		# Search directory by fingerprint
		all_feeds = mochi.directory.search("feed", "", False)
		for entry in all_feeds:
			entry_fp = entry.get("fingerprint", "").replace("-", "")
			if entry_fp == fingerprint:
				# Avoid duplicates if already found by ID
				found = False
				for r in results:
					if r.get("id") == entry.get("id"):
						found = True
						break
				if not found:
					results.append(entry)
				break

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

			if mochi.valid(feed_id, "entity"):
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
			elif mochi.valid(feed_id, "fingerprint"):
				all_feeds = mochi.directory.search("feed", "", False)
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
	s = mochi.remote.stream("1JYmMpQU7fxvTrwHpNpiwKCgUg3odWqX7s9t1cLswSMAro5M2P", "recommendations", "list", {"type": "feed", "language": "en"})
	if not s:
		return {"status": 500, "error": "Unable to connect to the recommendations service", "data": {"feeds": []}}

	r = s.read()
	if r.get("status") != "200":
		return {"status": 500, "error": "Unable to connect to the recommendations service", "data": {"feeds": []}}

	recommendations = []
	items = s.read()
	if type(items) not in ["list", "tuple"]:
		return {"data": {"feeds": []}}

	for item in items:
		entity_id = item.get("entity", "")
		if entity_id and entity_id not in existing_ids:
			recommendations.append({
				"id": entity_id,
				"name": item.get("name", ""),
				"blurb": item.get("blurb", ""),
				"fingerprint": mochi.entity.fingerprint(entity_id),
			})

	return {"data": {"feeds": recommendations}}

# Probe a remote feed by URL without subscribing
def action_probe(a):
	if not a.user.identity.id:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id

	url = a.input("url")
	if not url:
		a.error(400, "No URL provided")
		return

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
		a.error(400, "Invalid URL format. Expected: https://server/feeds/FEED_ID")
		return

	if not server or server == protocol:
		a.error(400, "Could not extract server from URL")
		return

	if not feed_id or not mochi.valid(feed_id, "entity"):
		a.error(400, "Could not extract valid feed ID from URL")
		return

	peer = mochi.remote.peer(server)
	if not peer:
		a.error(502, "Unable to connect to server")
		return
	response = mochi.remote.request(feed_id, "feeds", "info", {"feed": feed_id}, peer)
	if response.get("error"):
		a.error(response.get("code", 404), response["error"])
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
def action_new(a): # feeds_new
	name = "" if mochi.db.exists("select * from feeds limit 1") else a.user.identity.name

	return {
		"data": {"name": name}
	}

# Get new post data.
def action_post_new(a): # feeds_post_new
	if not a.user.identity.id:
		a.error(401, "Not logged in")
		return

	feeds = mochi.db.rows("select * from feeds order by name")
	if len(feeds) == 0:
		a.error(500, "You do not own any feeds")
		return
	
	owned_feeds = []
	for feed in feeds:
		if feed.get("owner") == 1:
			owned_feeds.append(feed)
	
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
    if not place.get("name") or not mochi.valid(place.get("name", ""), "line"):
        return False
    if place.get("lat") == None or place.get("lon") == None:
        return False
    return True

# Helper: Validate post data (checkin, travelling, etc.)
def validate_post_data(data):
    if not data:
        return True
    if data.get("checkin") and not validate_place(data["checkin"]):
        return False
    if data.get("travelling"):
        travelling = data["travelling"]
        if not travelling.get("origin") or not validate_place(travelling["origin"]):
            return False
        if not travelling.get("destination") or not validate_place(travelling["destination"]):
            return False
    return True

def action_post_create(a):
    if not a.user:
        a.error(401, "Not logged in")
        return
    user_id = a.user.identity.id

    feed = get_feed(a)
    if not feed:
        a.error(404, "Feed not found")
        return
    feed_id = feed["id"]

    if not check_access(a, feed_id, "post"):
        a.error(403, "Access denied")
        return

    # Parse extended data (checkin, travelling, etc.)
    data_str = a.input("data")
    data = None
    if data_str:
        data = json.decode(data_str)
        if not validate_post_data(data):
            a.error(400, "Invalid data")
            return

    # Check if post has content beyond text (checkin, travelling, or attachments)
    has_checkin = data and data.get("checkin")
    has_travelling = data and data.get("travelling")
    has_files = a.file("files") != None

    body = a.input("body")
    if not mochi.valid(body, "text"):
        # Allow empty body if there's a check-in, travelling, or attachments
        if not has_checkin and not has_travelling and not has_files:
            a.error(400, "Invalid body")
            return
        body = ""

    post_uid = mochi.uid()
    if mochi.db.exists("select id from posts where id=?", post_uid):
        a.error(500, "Duplicate ID")
        return

    now = mochi.time.now()
    data_value = json.encode(data) if data else ""
    mochi.db.execute("insert into posts (id, feed, body, data, created, updated) values (?, ?, ?, ?, ?, ?)",
        post_uid, feed_id, body, data_value, now, now)
    set_feed_updated(feed_id)

    # Get subscribers for notification
    subscribers = mochi.db.rows("select id from subscribers where feed=? and id!=?", feed_id, user_id)

    # Save any uploaded attachments locally
    attachments = mochi.attachment.save(post_uid, "files", [], [], [])

    # Send post to subscribers with attachment metadata piggybacked
    post_event = {"id": post_uid, "created": now, "body": body}
    if data:
        post_event["data"] = data
    if attachments:
        post_event["attachments"] = [{"id": att["id"], "name": att["name"], "size": att["size"], "content_type": att.get("type", ""), "rank": att.get("rank", 0), "created": att.get("created", now)} for att in attachments]
    broadcast_event(feed_id, "post/create", post_event, user_id)

    # Send WebSocket notification for real-time UI updates
    broadcast_websocket(feed_id, {"type": "post/create", "feed": feed_id, "post": post_uid, "sender": user_id})


    return {
        "data": {
            "id": post_uid,
            "feed": feed,
            "attachments": attachments
        }
    }

# Edit a post (owner only)
def action_post_edit(a):
	if not a.user:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id

	feed_id = a.input("feed")
	post_id = a.input("post")
	body = a.input("body")

	if not mochi.valid(body, "text"):
		a.error(400, "Invalid body")
		return

	# Parse extended data (checkin, travelling, etc.)
	data_str = a.input("data")
	data = None
	if data_str:
		data = json.decode(data_str)
		if not validate_post_data(data):
			a.error(400, "Invalid data")
			return

	info = feed_by_id(user_id, feed_id)
	if not info:
		a.error(404, "Feed not found")
		return

	if info.get("owner") == 1:
		# Local feed - edit directly
		post = mochi.db.row("select * from posts where id=? and feed=?", post_id, info["id"])
		if not post:
			a.error(404, "Post not found")
			return

		now = mochi.time.now()
		data_value = json.encode(data) if data else ""
		mochi.db.execute("update posts set body=?, data=?, updated=?, edited=? where id=?", body, data_value, now, now, post_id)

		subscribers = [s["id"] for s in mochi.db.rows("select id from subscribers where feed=?", info["id"])]

		# Handle attachment changes
		# Order list includes existing IDs and "new:N" placeholders for new files
		order = a.inputs("order")

		# Save new attachments first (if any files were uploaded)
		new_attachments = mochi.attachment.save(post_id, "files", [], [], [])

		# Build final order by replacing "new:N" placeholders with actual IDs
		final_order = []
		for item in order:
			if item.startswith("new:"):
				idx = int(item[4:])
				if idx < len(new_attachments):
					final_order.append(new_attachments[idx]["id"])
			else:
				final_order.append(item)

		if final_order:
			# Delete attachments not in the final order
			existing = mochi.attachment.list(post_id)
			for att in existing:
				if att["id"] not in final_order:
					mochi.attachment.delete(att["id"], [])

			# Reorder all attachments according to final order (positions start at 1)
			for i, att_id in enumerate(final_order):
				mochi.attachment.move(att_id, i + 1, [])

		edit_event = {"post": post_id, "body": body, "edited": now}
		if data:
			edit_event["data"] = data
		edit_event["attachments"] = mochi.attachment.list(post_id)
		broadcast_event(info["id"], "post/edit", edit_event, user_id)

		# Send WebSocket notification for real-time UI updates (to owner and all subscribers)
		broadcast_websocket(info["id"], {"type": "post/edit", "feed": info["id"], "post": post_id, "sender": user_id})

		return {"data": {"ok": True}}

	elif info.get("server"):
		# Remote feed - send edit to owner
		peer = mochi.remote.peer(info["server"])
		if not peer:
			a.error(502, "Unable to connect to server")
			return
		payload = {"feed": feed_id, "post": post_id, "body": body}
		if data:
			payload["data"] = data
		response = mochi.remote.request(feed_id, "feeds", "post/edit", payload, peer)
		if response.get("error"):
			a.error(response.get("code", 403), response["error"])
			return
		return {"data": response or {"ok": True}}

	a.error(403, "Not authorized")

# Delete a post (owner only)
def action_post_delete(a):
	if not a.user:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id

	feed_id = a.input("feed")
	post_id = a.input("post")

	info = feed_by_id(user_id, feed_id)
	if not info:
		a.error(404, "Feed not found")
		return

	if info.get("owner") == 1:
		# Local feed - delete directly
		post = mochi.db.row("select * from posts where id=? and feed=?", post_id, info["id"])
		if not post:
			a.error(404, "Post not found")
			return

		subscribers = [s["id"] for s in mochi.db.rows("select id from subscribers where feed=?", info["id"])]

		mochi.db.execute("delete from reactions where post=?", post_id)
		mochi.db.execute("delete from comments where post=?", post_id)
		mochi.attachment.clear(post_id, [])
		mochi.db.execute("delete from posts where id=?", post_id)

		broadcast_event(info["id"], "post/delete", {"post": post_id}, user_id)

		# Send WebSocket notification for real-time UI updates (to owner and all subscribers)
		broadcast_websocket(info["id"], {"type": "post/delete", "feed": info["id"], "post": post_id, "sender": user_id})

		return {"data": {"ok": True}}

	elif info.get("server"):
		# Remote feed - send delete to owner
		peer = mochi.remote.peer(info["server"])
		if not peer:
			a.error(502, "Unable to connect to server")
			return
		response = mochi.remote.request(feed_id, "feeds", "post/delete", {"feed": feed_id, "post": post_id}, peer)
		if response.get("error"):
			a.error(response.get("code", 403), response["error"])
			return
		return {"data": response or {"ok": True}}

	a.error(403, "Not authorized")

def action_subscribe(a): # feeds_subscribe
	if not a.user.identity.id:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id

	feed_id = a.input("feed")
	server = a.input("server")
	if not mochi.valid(feed_id, "entity"):
		a.error(400, "Invalid ID")
		return

	# Get feed info from remote or directory
	schema = None
	if server:
		peer = mochi.remote.peer(server)
		if not peer:
			a.error(502, "Unable to connect to server")
			return
		response = mochi.remote.request(feed_id, "feeds", "info", {"feed": feed_id}, peer)
		if response.get("error"):
			a.error(response.get("code", 404), response["error"])
			return
		feed_name = response.get("name", "")
		schema = mochi.remote.request(feed_id, "feeds", "schema", {}, peer)
	else:
		# Use directory lookup when no server specified
		directory = mochi.directory.get(feed_id)
		if directory == None or len(directory) == 0:
			a.error(404, "Unable to find feed in directory")
			return
		feed_name = directory["name"]
		server = directory.get("location", "")
		if server:
			peer = mochi.remote.peer(server)
			if peer:
				schema = mochi.remote.request(feed_id, "feeds", "schema", {}, peer)

	# Check for fingerprint column (legacy schema support)
	has_fingerprint = False
	
	# Method 1: Check table info
	columns = mochi.db.rows("pragma table_info(feeds)")
	for col in columns:
		if col["name"].lower() == "fingerprint":
			has_fingerprint = True
			break

	# Method 2: Check actual data (fallback if pragma fails)
	if not has_fingerprint:
		# Check if any row has partial fingerprint data (keys in returned dict)
		sample = mochi.db.row("select * from feeds limit 1")
		if sample and sample.get("fingerprint") != None:
			has_fingerprint = True

	if has_fingerprint:
		# Ensure fingerprint is not None (NOT NULL constraint)
		fp = mochi.entity.fingerprint(feed_id) or ""
		mochi.db.execute("replace into feeds ( id, name, owner, subscribers, updated, server, fingerprint ) values ( ?, ?, 0, 1, ?, ?, ? )", 
			feed_id, feed_name, mochi.time.now(), server or "", fp)
	else:
		mochi.db.execute("replace into feeds ( id, name, owner, subscribers, updated, server ) values ( ?, ?, 0, 1, ?, ? )", 
			feed_id, feed_name, mochi.time.now(), server or "")
	mochi.db.execute("replace into subscribers ( feed, id, name ) values ( ?, ?, ? )", feed_id, user_id, a.user.identity.name)

	# Update subscriber count accurately using count query
	mochi.db.execute("update feeds set subscribers=(select count(*) from subscribers where feed=? and system=0), updated=? where id=?", feed_id, mochi.time.now(), feed_id)

	# Insert schema data so posts/comments/reactions are available immediately
	if schema and not schema.get("error"):
		insert_feed_schema(feed_id, schema)

	mochi.log.info("subscribe: sending P2P message from=%s to=%s", user_id, feed_id)
	send_result = mochi.message.send(headers(user_id, feed_id, "subscribe"), {"name": a.user.identity.name})
	if send_result:
		mochi.log.info("subscribe: P2P send failed: %s", send_result)

	# Request notification subscription for new posts (idempotent - won't duplicate)
	mochi.service.call("notifications", "subscribe", "post", "New posts in subscribed feeds")

	return {
		"data": {"fingerprint": mochi.entity.fingerprint(feed_id)}
	}

def action_unsubscribe(a): # feeds_unsubscribe
	if not a.user.identity.id:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id

	feed_id = a.input("feed")
	if not mochi.valid(feed_id, "entity") and not mochi.valid(feed_id, "fingerprint"):
		a.error(400, "Invalid ID")
		return

	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		a.error(404, "Feed not found")
		return
	
	# feed_id might be fingerprint, ensure it is full entity id
	feed_id = feed_data["id"]

	if feed_data["entity"]:
		a.error(400, "You own this feed")
		return

	if not is_feed_owner(user_id, feed_data):
		mochi.db.execute("delete from reactions where feed=?", feed_id)
		mochi.db.execute("delete from comments where feed=?", feed_id)
		mochi.db.execute("delete from posts where feed=?", feed_id)
		mochi.db.execute("delete from subscribers where feed=?", feed_id)
		mochi.db.execute("delete from feeds where id=?", feed_id)

		mochi.message.send(headers(user_id, feed_id, "unsubscribe"))

	return {"data": {"success": True}}

# Delete a feed (owner only)
def action_delete(a):
	if not a.user.identity.id:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id

	feed_id = a.input("feed")
	if not mochi.valid(feed_id, "entity"):
		a.error(400, "Invalid feed ID")
		return

	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		a.error(404, "Feed not found")
		return

	if not is_feed_owner(user_id, feed_data):
		a.error(403, "Not feed owner")
		return

	# Notify subscribers that feed is being deleted (before removing subscriber list)
	broadcast_event(feed_id, "deleted", {"feed": feed_id})

	# Delete attachments for all posts in this feed
	posts = mochi.db.rows("select id from posts where feed=?", feed_id)
	for post in posts:
		attachments = mochi.attachment.list(post["id"])
		for att in attachments:
			mochi.attachment.delete(att["id"], [])

	# Delete all feed data
	mochi.db.execute("delete from reactions where feed=?", feed_id)
	mochi.db.execute("delete from comments where feed=?", feed_id)
	mochi.db.execute("delete from posts where feed=?", feed_id)
	mochi.db.execute("delete from subscribers where feed=?", feed_id)
	mochi.db.execute("delete from feeds where id=?", feed_id)

	# Remove entity from directory
	mochi.entity.delete(feed_id)

	return {"data": {"success": True}}

# Rename a feed
def action_rename(a):
	if not a.user.identity.id:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id

	feed_id = a.input("feed")
	if not mochi.valid(feed_id, "entity"):
		a.error(400, "Invalid feed ID")
		return

	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		a.error(404, "Feed not found")
		return

	if not is_feed_owner(user_id, feed_data):
		a.error(403, "Not feed owner")
		return

	name = a.input("name")
	if not name or not mochi.valid(name, "name"):
		a.error(400, "Invalid name")
		return

	# Update entity (triggers directory update and timestamp reset for public feeds)
	mochi.entity.update(feed_id, name=name)

	# Update local feeds table
	mochi.db.execute("update feeds set name=? where id=?", name, feed_id)

	# Broadcast to subscribers
	if feed_data.get("owner") != 0:
		broadcast_event(feed_id, "update", {"name": name})

	return {"data": {"success": True}}

def action_comment_new(a): # feeds_comment_new
	if not a.user.identity.id:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id

	return {
		"data": {
			"feed": feed_by_id(user_id, a.input("feed")),
			"post": a.input("post"),
			"parent": a.input("parent")
		}
	}

def action_comment_create(a):
    if not a.user:
        a.error(401, "Not logged in")
        return
    if not a.user.identity or not a.user.identity.id:
        a.error(403, "Identity required")
        return
    user_id = a.user.identity.id

    feed_id = a.input("feed")
    post_id = a.input("post")
    parent_id = a.input("parent") or ""
    body = a.input("body")

    if not mochi.valid(body, "text"):
        a.error(400, "Invalid body")
        return

    # Get local feed data if available
    feed = None
    if feed_id and (mochi.valid(feed_id, "entity") or mochi.valid(feed_id, "fingerprint")):
        feed = feed_by_id(user_id, feed_id)

    # If feed exists locally AND we own it, handle locally
    if feed and feed.get("owner") == 1:
        feed_id = feed["id"]

        # Allow comments on public feeds, otherwise check access control
        is_public = feed.get("privacy", "public") == "public"
        if not is_public and not check_access(a, feed_id, "comment"):
            a.error(403, "Access denied")
            return

        if not mochi.db.exists("select id from posts where id=? and feed=?", post_id, feed_id):
            a.error(404, "Post not found")
            return

        # Only check parent exists if this is a reply to another comment (parent_id not empty)
        if parent_id and not mochi.db.exists("select id from comments where id=? and post=?", parent_id, post_id):
            a.error(404, "Parent not found")
            return

        input_id = a.input("id")
        uid = input_id if input_id and mochi.valid(input_id, "text") else mochi.uid()
        if mochi.db.exists("select id from comments where id=?", uid):
            a.error(500, "Duplicate ID")
            return

        now = mochi.time.now()
        mochi.db.execute("insert into comments (id, feed, post, parent, subscriber, name, body, created) values (?, ?, ?, ?, ?, ?, ?, ?)",
            uid, feed_id, post_id, parent_id, user_id, a.user.identity.name, body, now)

        # Save comment attachments locally
        attachments = mochi.attachment.save(uid, "files", [], [], [])

        set_post_updated(post_id)
        set_feed_updated(feed_id)

        # Broadcast to subscribers with attachment metadata
        comment_event = {"id": uid, "post": post_id, "parent": parent_id, "created": now,
             "subscriber": user_id, "name": a.user.identity.name, "body": body}
        if attachments:
            comment_event["attachments"] = [{"id": att["id"], "name": att["name"], "size": att["size"], "content_type": att.get("type", ""), "rank": att.get("rank", 0), "created": att.get("created", now)} for att in attachments]
        broadcast_event(feed_id, "comment/create", comment_event, user_id)

        # Send WebSocket notification for real-time UI updates
        broadcast_websocket(feed["id"], {"type": "comment/add", "feed": feed["id"], "post": post_id, "comment": uid, "sender": user_id})

        return {"data": {"id": uid, "feed": feed, "post": post_id}}

    # Subscribed feed or remote feed - forward via P2P to owner
    # Use feed ID from local record if available, otherwise resolve from input
    target_feed_id = feed["id"] if feed else resolve_feed_id(feed_id)
    
    if not target_feed_id or not mochi.valid(target_feed_id, "entity"):
        # Could not resolve to valid entity ID
        a.error(404, "Feed not found")
        return

    if not mochi.valid(post_id, "id"):
        a.error(400, "Invalid post ID")
        return

    # Generate comment ID locally (similar to forums pattern)
    input_id = a.input("id")
    uid = input_id if input_id and mochi.valid(input_id, "text") else mochi.uid()
    now = mochi.time.now()

    # Save locally FIRST for optimistic UI (ensures comment is stored even if P2P fails)
    mochi.db.execute("replace into comments ( id, feed, post, parent, subscriber, name, body, created ) values ( ?, ?, ?, ?, ?, ?, ?, ? )",
        uid, target_feed_id, post_id, parent_id, user_id, a.user.identity.name, body, now)

    # Save comment attachments locally
    attachments = mochi.attachment.save(uid, "files", [], [], [])

    # Send WebSocket notification for real-time UI updates on subscriber's side
    broadcast_websocket(target_feed_id, {"type": "comment/add", "feed": target_feed_id, "post": post_id, "comment": uid, "sender": user_id})

    # Send comment to feed owner with attachment metadata
    submit_data = {"id": uid, "post": post_id, "parent": parent_id, "body": body, "name": a.user.identity.name}
    if attachments:
        submit_data["attachments"] = [{"id": att["id"], "name": att["name"], "size": att["size"], "content_type": att.get("type", ""), "rank": att.get("rank", 0), "created": att.get("created", now)} for att in attachments]

    mochi.log.info("comment_create: sending P2P message from=%s to=%s", user_id, target_feed_id)
    send_result = mochi.message.send(
        {"from": user_id, "to": target_feed_id, "service": "feeds", "event": "comment/submit"},
        submit_data
    )
    if send_result:
        mochi.log.info("comment_create: P2P send failed: %s", send_result)

    return {"data": {"id": uid, "feed": target_feed_id, "post": post_id}}

# Edit a comment (author only)
def action_comment_edit(a):
	if not a.user:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id

	feed_id = a.input("feed")
	comment_id = a.input("comment")
	body = a.input("body")

	if not mochi.valid(body, "text"):
		a.error(400, "Invalid body")
		return

	info = feed_by_id(user_id, feed_id)
	if not info:
		a.error(404, "Feed not found")
		return

	if info.get("owner") == 1:
		# Local feed - verify comment author
		row = mochi.db.row("select * from comments where id=? and feed=?", comment_id, info["id"])
		if not row:
			a.error(404, "Comment not found")
			return
		if row["subscriber"] != user_id:
			a.error(403, "Not authorized")
			return

		now = mochi.time.now()
		mochi.db.execute("update comments set body=?, edited=? where id=?", body, now, comment_id)
		set_post_updated(row["post"])
		set_feed_updated(info["id"])

		broadcast_event(info["id"], "comment/edit", {"comment": comment_id, "post": row["post"], "body": body, "edited": now}, user_id)

		# Send WebSocket notification for real-time UI updates (to owner and all subscribers)
		broadcast_websocket(info["id"], {"type": "comment/edit", "feed": info["id"], "post": row["post"], "comment": comment_id, "sender": user_id})

		return {"data": {"ok": True}}

	else:
		# Subscriber - send edit request to feed owner via P2P
		# Try to find comment locally (may exist if synced, or may not if only remote)
		row = mochi.db.row("select * from comments where id=? and feed=?", comment_id, info["id"])
		if row:
			# Have local copy - verify author
			if row["subscriber"] != user_id:
				a.error(403, "Not authorized")
				return
			# Update locally for optimistic UI
			now = mochi.time.now()
			mochi.db.execute("update comments set body=?, edited=? where id=?", body, now, comment_id)
			post_id = row["post"]
		else:
			# No local copy - get post_id from URL path
			post_id = a.input("post")
			if not post_id:
				a.error(400, "Post ID required")
				return

		# Send edit request to feed owner (they verify authorization)
		mochi.message.send(
			headers(user_id, info["id"], "comment/edit/submit"),
			{"comment": comment_id, "post": post_id, "body": body}
		)

		return {"data": {"ok": True}}

# Delete a comment (author or feed owner)
def action_comment_delete(a):
	if not a.user:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id

	feed_id = a.input("feed")
	comment_id = a.input("comment")

	info = feed_by_id(user_id, feed_id)
	if not info:
		a.error(404, "Feed not found")
		return

	if info.get("owner") == 1:
		# Local feed - verify author or feed owner
		row = mochi.db.row("select * from comments where id=? and feed=?", comment_id, info["id"])
		if not row:
			a.error(404, "Comment not found")
			return
		if row["subscriber"] != user_id:
			a.error(403, "Not authorized")
			return

		post_id = row["post"]
		delete_comment_tree(comment_id)
		set_post_updated(post_id)
		set_feed_updated(info["id"])

		broadcast_event(info["id"], "comment/delete", {"comment": comment_id, "post": post_id}, user_id)

		# Send WebSocket notification for real-time UI updates (to owner and all subscribers)
		broadcast_websocket(info["id"], {"type": "comment/delete", "feed": info["id"], "post": post_id, "comment": comment_id, "sender": user_id})

		return {"data": {"ok": True}}

	else:
		# Subscriber - send delete request to feed owner via P2P
		# Try to find comment locally (may exist if synced, or may not if only remote)
		row = mochi.db.row("select * from comments where id=? and feed=?", comment_id, info["id"])
		if row:
			# Have local copy - verify author
			if row["subscriber"] != user_id:
				a.error(403, "Not authorized")
				return
			post_id = row["post"]
			# Delete locally for optimistic UI
			delete_comment_tree(comment_id)
		else:
			# No local copy - get post_id from URL path
			post_id = a.input("post")
			if not post_id:
				a.error(400, "Post ID required")
				return

		# Send delete request to feed owner (they verify authorization)
		mochi.message.send(
			headers(user_id, info["id"], "comment/delete/submit"),
			{"comment": comment_id, "post": post_id}
		)

		return {"data": {"ok": True}}

# Helper to recursively delete a comment and its replies
def delete_comment_tree(comment_id):
	children = mochi.db.rows("select id from comments where parent=?", comment_id)
	for child in children:
		delete_comment_tree(child["id"])
	attachments = mochi.attachment.list(comment_id)
	for att in attachments:
		mochi.attachment.delete(att["id"])
	mochi.db.execute("delete from reactions where comment=?", comment_id)
	mochi.db.execute("delete from comments where id=?", comment_id)

def action_post_react(a):
    if not a.user:
        a.error(401, "Not logged in")
        return
    user_id = a.user.identity.id

    feed_id = a.input("feed")
    post_id = a.input("post")
    reaction_input = a.input("reaction")


    result = is_reaction_valid(reaction_input)
    if not result["valid"]:
        a.error(400, "Invalid reaction")
        return
    reaction = result["reaction"]

    # Get local feed data if available
    feed = None
    if feed_id and (mochi.valid(feed_id, "entity") or mochi.valid(feed_id, "fingerprint")):
        feed = feed_by_id(user_id, feed_id)

    # If feed exists locally AND we own it, handle reaction locally
    if feed and feed.get("owner") == 1:
        feed_id = feed["id"]

        post_data = mochi.db.row("select * from posts where id=? and feed=?", post_id, feed_id)
        if not post_data:
            a.error(404, "Post not found")
            return

        # Check access for react permission
        if not check_access(a, feed_id, "react"):
            a.error(403, "Access denied")
            return

        post_reaction_set(post_data, user_id, a.user.identity.name, reaction)

        # Broadcast to subscribers
        broadcast_event(feed_id, "post/react",
            {"feed": feed_id, "post": post_id, "subscriber": user_id,
             "name": a.user.identity.name, "reaction": reaction}, user_id)

        # Send WebSocket notification for real-time UI updates
        broadcast_websocket(feed_id, {"type": "react/post", "feed": feed_id, "post": post_id, "sender": user_id})

        return {"data": {"feed": feed, "id": post_id, "reaction": reaction}}

    # Subscribed feed or remote feed - forward via P2P to owner
    target_feed_id = feed["id"] if feed else resolve_feed_id(feed_id)
    
    if not target_feed_id or not mochi.valid(target_feed_id, "entity"):
        # Could not resolve to valid entity ID
        a.error(404, "Feed not found")
        return

    if not mochi.valid(post_id, "id"):
        a.error(400, "Invalid post ID")
        return

    # Save reaction locally FIRST so it's available even if P2P fails
    if reaction:
        mochi.db.execute("replace into reactions ( feed, post, subscriber, name, reaction ) values ( ?, ?, ?, ?, ? )",
            target_feed_id, post_id, user_id, a.user.identity.name, reaction)
    else:
        mochi.db.execute("delete from reactions where feed=? and post=? and comment='' and subscriber=?",
            target_feed_id, post_id, user_id)

    # Send WebSocket notification for real-time UI updates on subscriber's side
    broadcast_websocket(target_feed_id, {"type": "react/post", "feed": target_feed_id, "post": post_id, "sender": user_id})

    # Send reaction to feed owner using mochi.message.send (fire-and-forget)
    # Use user's identity directly in 'from' field (not via headers helper)
    # Capture result to prevent any error from propagating and aborting the action.
    send_result = mochi.message.send(
        {"from": user_id, "to": target_feed_id, "service": "feeds", "event": "post/react/submit"},
        {"post": post_id, "reaction": reaction if reaction else "none", "name": a.user.identity.name}
    )
    if send_result:
        mochi.log.info("post_react: P2P send result: %s", send_result)

    return {"data": {"feed": target_feed_id, "post": post_id, "reaction": reaction}}

def action_comment_react(a):
    if not a.user:
        a.error(401, "Not logged in")
        return
    if not a.user.identity or not a.user.identity.id:
        a.error(403, "Identity required")
        return
    user_id = a.user.identity.id

    feed_id = a.input("feed")
    comment_id = a.input("comment")
    reaction_input = a.input("reaction")
    
    result = is_reaction_valid(reaction_input)
    if not result["valid"]:
        a.error(400, "Invalid reaction")
        return
    reaction = result["reaction"]

    # Get local feed data if available
    feed = None
    if feed_id and (mochi.valid(feed_id, "entity") or mochi.valid(feed_id, "fingerprint")):
        feed = feed_by_id(user_id, feed_id)

    # If feed exists locally AND we own it, handle reaction locally
    if feed and feed.get("owner") == 1:
        feed_id = feed["id"]

        comment_data = mochi.db.row("select * from comments where id=? and feed=?", comment_id, feed_id)
        if not comment_data:
            a.error(404, "Comment not found")
            return

        # Check access for react permission
        if not check_access(a, feed_id, "react"):
            a.error(403, "Access denied")
            return

        comment_reaction_set(comment_data, user_id, a.user.identity.name, reaction)

        # Broadcast to subscribers
        broadcast_event(feed_id, "comment/react",
            {"feed": feed_id, "post": comment_data["post"], "comment": comment_id,
             "subscriber": user_id, "name": a.user.identity.name, "reaction": reaction}, user_id)

        # Send WebSocket notification for real-time UI updates
        broadcast_websocket(feed_id, {"type": "react/comment", "feed": feed_id, "post": comment_data["post"], "comment": comment_id, "sender": user_id})

        return {"data": {"feed": feed, "post": comment_data["post"], "comment": comment_id, "reaction": reaction}}

    # Subscribed feed or remote feed - forward via P2P to owner
    target_feed_id = feed["id"] if feed else resolve_feed_id(feed_id)
    
    if not target_feed_id or not mochi.valid(target_feed_id, "entity"):
        # Could not resolve to valid entity ID
        a.error(404, "Feed not found")
        return

    if not mochi.valid(comment_id, "text"):
        a.error(400, "Invalid comment ID")
        return

    # Get post_id for the comment (needed for WebSocket notification)
    comment_row = mochi.db.row("select post from comments where id=?", comment_id)
    post_id_for_ws = comment_row["post"] if comment_row else ""

    # Save reaction locally FIRST so it's available even if P2P fails
    if reaction:
        mochi.db.execute("replace into reactions ( feed, post, comment, subscriber, name, reaction ) values ( ?, ?, ?, ?, ?, ? )",
            target_feed_id, post_id_for_ws, comment_id, user_id, a.user.identity.name, reaction)
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
        {"comment": comment_id, "post": post_id_for_ws, "reaction": reaction if reaction else "none", "name": a.user.identity.name}
    )
    if send_result:
        mochi.log.info("comment_react: P2P send result: %s", send_result)

    return {"data": {"feed": target_feed_id, "comment": comment_id, "reaction": reaction}}

# Access control actions

# List access rules for a feed
def action_access_list(a):
    feed = get_feed(a)
    if not feed:
        a.error(404, "Feed not found")
        return

    if not check_access(a, feed["id"], "manage"):
        a.error(403, "Access denied")
        return

    # Get owner - if we own this entity, use current user's info
    owner = None
    if feed.get("owner") == 1:
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
            rule["isOwner"] = True
        # Resolve names for non-special subjects
        if subject and subject not in ("*", "+") and not subject.startswith("#"):
            if subject.startswith("@"):
                # Look up group name
                group_id = subject[1:]  # Remove @ prefix
                group = mochi.group.get(group_id)
                if group:
                    rule["name"] = group.get("name", group_id)
            elif mochi.valid(subject, "entity"):
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
        a.error(401, "Not logged in")
        return

    feed = get_feed(a)
    if not feed:
        a.error(404, "Feed not found")
        return

    if not check_access(a, feed["id"], "manage"):
        a.error(403, "Access denied")
        return

    subject = a.input("subject")
    level = a.input("level")

    if not subject:
        a.error(400, "Subject is required")
        return
    if len(subject) > 255:
        a.error(400, "Subject too long")
        return

    if not level:
        a.error(400, "Level is required")
        return

    if level not in ["view", "react", "comment", "none"]:
        a.error(400, "Invalid level")
        return

    resource = "feed/" + feed["id"]
    granter = a.user.identity.id

    # First, revoke all existing rules for this subject (including wildcard)
    for op in ACCESS_LEVELS + ["*"]:
        mochi.access.revoke(subject, resource, op)

    # Then set the new level
    if level == "none":
        # Store deny rules for all levels to block access
        for op in ACCESS_LEVELS:
            mochi.access.deny(subject, resource, op, granter)
    else:
        # Store a single allow rule for the level
        mochi.access.allow(subject, resource, level, granter)

    return {"data": {"success": True}}

# Revoke all access from a subject (remove from access list entirely)
def action_access_revoke(a):
    if not a.user:
        a.error(401, "Not logged in")
        return

    feed = get_feed(a)
    if not feed:
        a.error(404, "Feed not found")
        return

    if not check_access(a, feed["id"], "manage"):
        a.error(403, "Access denied")
        return

    subject = a.input("subject")

    if not subject:
        a.error(400, "Subject is required")
        return
    if len(subject) > 255:
        a.error(400, "Subject too long")
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
        a.error(401, "Not logged in")
        return

    feed = get_feed(a)
    if not feed:
        a.error(404, "Feed not found")
        return

    if not check_access(a, feed["id"], "manage"):
        a.error(403, "Access denied")
        return

    members = mochi.db.rows("select id, name from subscribers where feed=?", feed["id"])
    return {"data": {"members": members}}

# Add a member to a feed
def action_member_add(a):
    if not a.user:
        a.error(401, "Not logged in")
        return

    feed = get_feed(a)
    if not feed:
        a.error(404, "Feed not found")
        return

    if not check_access(a, feed["id"], "manage"):
        a.error(403, "Access denied")
        return

    member_id = a.input("member")
    if not member_id or not mochi.valid(member_id, "entity"):
        a.error(400, "Invalid member ID")
        return

    # Check if already a member
    if mochi.db.exists("select 1 from subscribers where feed=? and id=?", feed["id"], member_id):
        a.error(400, "Already a member")
        return

    # Look up member name from directory or use a placeholder
    member_info = mochi.directory.get(member_id)
    member_name = member_info.get("name", "Unknown") if member_info else "Unknown"

    # Add to subscribers
    mochi.db.execute("insert into subscribers (feed, id, name) values (?, ?, ?)",
        feed["id"], member_id, member_name)
    mochi.db.execute("update feeds set subscribers = subscribers + 1 where id=?", feed["id"])

    # Grant view access for private feeds
    if feed.get("privacy") == "private":
        resource = "feed/" + feed["id"]
        mochi.access.allow(member_id, resource, "view", a.user.identity.id)

    return {"data": {"success": True, "member": {"id": member_id, "name": member_name}}}

# Remove a member from a feed
def action_member_remove(a):
    if not a.user:
        a.error(401, "Not logged in")
        return

    feed = get_feed(a)
    if not feed:
        a.error(404, "Feed not found")
        return

    if not check_access(a, feed["id"], "manage"):
        a.error(403, "Access denied")
        return

    member_id = a.input("member")
    if not member_id or not mochi.valid(member_id, "entity"):
        a.error(400, "Invalid member ID")
        return

    # Can't remove the owner
    owner_id = None
    if feed.get("entity"):
        owner_id = feed["entity"].get("creator")
    if member_id == owner_id:
        a.error(400, "Cannot remove feed owner")
        return

    # Check if actually a member
    if not mochi.db.exists("select 1 from subscribers where feed=? and id=?", feed["id"], member_id):
        a.error(404, "Not a member")
        return

    # Clean up member's reactions
    mochi.db.execute("delete from reactions where feed=? and subscriber=?", feed["id"], member_id)

    # Remove from subscribers
    mochi.db.execute("delete from subscribers where feed=? and id=?", feed["id"], member_id)
    mochi.db.execute("update feeds set subscribers = subscribers - 1 where id=? and subscribers > 0", feed["id"])

    # Revoke all access for this member
    resource = "feed/" + feed["id"]
    for op in ["view", "post", "comment", "react", "manage", "*"]:
        mochi.access.revoke(member_id, resource, op)

    return {"data": {"success": True}}

# EVENTS

def event_comment_create(e): # feeds_comment_create_event
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		mochi.log.info("Feed dropping post to unknown feed")
		return
	feed_id = feed_data["id"]
		
	comment = {"id": e.content("id"), "post": e.content("post"), "parent": e.content("parent"), "created": e.content("created"), "subscriber": e.content("subscriber"), "name": e.content("name"), "body": e.content("body")}

	# Validate timestamp is within reasonable range (not more than 1 day in future or 1 year in past)
	now = mochi.time.now()
	if comment["created"] > now + 86400 or comment["created"] < now - 31536000:
		mochi.log.info("Feed dropping comment with invalid timestamp")
		return

	if not mochi.valid(comment["id"], "text"):
		mochi.log.info("Feed dropping comment with invalid ID '%s'", comment["id"])
		return

	if mochi.db.exists("select id from comments where id=?", comment["id"]):
		mochi.log.info("Feed dropping comment with duplicate ID '%s'", comment["id"])
		return



	if not mochi.valid(comment["name"], "line"):
		mochi.log.info("Feed dropping comment with invalid name '%s'", comment["name"])
		return

	if not mochi.valid(comment["body"], "text"):
		mochi.log.info("Feed dropping comment with invalid body '%s'", comment["body"])
		return

	mochi.db.execute("replace into comments ( id, feed, post, parent, subscriber, name, body, created ) values ( ?, ?, ?, ?, ?, ?, ?, ? )", comment["id"], feed_id, comment["post"], comment["parent"], comment["subscriber"], comment["name"], comment["body"], comment["created"])

	# Store attachment metadata from the event
	attachments = e.content("attachments") or []
	if attachments:
		mochi.attachment.store(attachments, e.header("from"), comment["id"])

	set_post_updated(comment["post"], comment["created"])
	set_feed_updated(feed_id, comment["created"])

	# Send WebSocket notification for real-time UI updates
	fingerprint = mochi.entity.fingerprint(feed_data["id"])
	if fingerprint:
		sender_id = e.header("from")
		mochi.websocket.write(fingerprint, {"type": "comment/create", "feed": feed_data["id"], "post": comment["post"], "comment": comment["id"], "sender": sender_id})

	# Create notification for this subscriber about new comment (runs on subscriber's server)
	# Skip notifications for historical comments synced during initial subscription
	if not e.content("sync"):
		feed_name = feed_data.get("name", "Feed")
		comment_excerpt = comment["body"][:50] + "..." if len(comment["body"]) > 50 else comment["body"]
		mochi.service.call("notifications", "send",
			"comment",
			"New comment",
			comment["name"] + " commented: " + comment_excerpt,
			comment["id"],
			"/feeds/" + fingerprint
		)

def event_comment_submit(e): # feeds_comment_submit_event
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("to"))
	if not feed_data:
		mochi.log.info("Feed dropping post to unknown feed")
		return
	feed_id = feed_data["id"]

	comment = {"id": e.content("id"), "post": e.content("post"), "parent": e.content("parent"), "body": e.content("body")}

	if not mochi.valid(comment["id"], "text"):
		mochi.log.info("Feed dropping comment with invalid ID '%s'", comment["id"])
		return

	if not mochi.db.exists("select id from posts where feed=? and id=?", feed_id, comment["post"]):
		mochi.log.info("Feed dropping comment for unknown post '%s'", comment["post"])
		return

	if comment["parent"] and not mochi.db.exists("select id from comments where feed=? and post=? and id=?", feed_id, comment["post"], comment["parent"]):
		mochi.log.info("Feed dropping comment with unknown parent '%s'", comment["parent"])
		return

	sub_data = get_feed_subscriber(feed_data, e.header("from"))
	if not sub_data:
		mochi.log.info("Feed dropping comment from unknown subscriber '%s'", e.header("from"))
		return

	now = mochi.time.now()
	comment["created"] = now
	comment["subscriber"] = e.header("from")
	# Use name from event (current), fall back to subscriber table, then directory
	comment["name"] = e.content("name") or sub_data["name"] or ""
	if not comment["name"]:
		entity = mochi.directory.get(e.header("from"))
		comment["name"] = entity["name"] if entity and entity.get("name") else "Anonymous"

	if not mochi.valid(comment["body"], "text"):
		mochi.log.info("Feed dropping comment with invalid body '%s'", comment["body"])
		return
	
	mochi.db.execute("replace into comments ( id, feed, post, parent, subscriber, name, body, created ) values ( ?, ?, ?, ?, ?, ?, ?, ? )", comment["id"], feed_id, comment["post"], comment["parent"], comment["subscriber"], comment["name"], comment["body"], now)

	# Store attachment metadata from the subscriber's event
	attachments = e.content("attachments") or []
	if attachments:
		mochi.attachment.store(attachments, e.header("from"), comment["id"])

	sender_id = e.header("from")

	set_post_updated(comment["post"])
	set_feed_updated(feed_id)

	# Send WebSocket notification to owner for real-time UI updates
	broadcast_websocket(feed_id, {"type": "comment/create", "feed": feed_id, "post": comment["post"], "comment": comment["id"], "sender": sender_id})

	# Create notification for feed owner about new comment
	feed_name = feed_data.get("name", "Feed")
	comment_excerpt = comment["body"][:50] + "..." if len(comment["body"]) > 50 else comment["body"]
	fingerprint = mochi.entity.fingerprint(feed_data["id"])
	mochi.log.info("event_comment_submit: sending notification for comment %s", comment["id"])
	notif_result = mochi.service.call("notifications", "send",
		"comment",
		"New comment",
		comment["name"] + " commented: " + comment_excerpt,
		comment["id"],
		"/feeds/" + fingerprint
	)
	mochi.log.info("event_comment_submit: notification result=%s", notif_result)

	# Re-broadcast to other subscribers with attachment metadata
	if attachments:
		comment["attachments"] = attachments
	subs = mochi.db.rows("select * from subscribers where feed=?", feed_id)
	for s in subs:
		if s["id"] == e.header("from") or s["id"] == user_id:
			continue
		mochi.message.send(headers(feed_id, s["id"], "comment/create"), comment)

# Handle comment edit request from subscriber (owner receiving edit)
def event_comment_edit_submit(e):
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("to"))
	if not feed_data:
		mochi.log.info("Feed dropping comment edit submit for unknown feed")
		return
	feed_id = feed_data["id"]

	sender_id = e.header("from")
	comment_id = e.content("comment")
	post_id = e.content("post")
	body = e.content("body")

	if not mochi.valid(comment_id, "text"):
		mochi.log.info("Feed dropping comment edit submit with invalid comment ID")
		return
	if not mochi.valid(body, "text"):
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

	now = mochi.time.now()
	mochi.db.execute("update comments set body=?, edited=? where id=?", body, now, comment_id)
	set_post_updated(post_id)
	set_feed_updated(feed_id)

	# Send WebSocket notification for real-time UI updates
	fingerprint = mochi.entity.fingerprint(feed_data["id"])
	if fingerprint:
		sender_id = e.header("from")
		mochi.websocket.write(fingerprint, {"type": "comment/edit", "feed": feed_data["id"], "post": post_id, "comment": comment_id, "sender": sender_id})

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
		mochi.log.info("Feed dropping comment delete submit for unknown feed")
		return
	feed_id = feed_data["id"]

	sender_id = e.header("from")
	comment_id = e.content("comment")
	post_id = e.content("post")

	if not mochi.valid(comment_id, "text"):
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
	if not mochi.valid(e.content("name"), "name"):
		mochi.log.info("Feed dropping comment reaction with invalid name '%s'", )
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
			mochi.log.info("Feed dropping comment reaction for unknown feed")
			return
		feed_id = feed_data["id"]
	else:
		comment_id = comment_data["id"]
		post_id = comment_data["post"]
		feed_data = feed_by_id(user_id, comment_data["feed"])
		if not feed_data:
			mochi.log.info("Feed dropping comment reaction for unknown feed")
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
		mochi.log.info("Saving comment reaction: feed=%s post=%s comment=%s subscriber=%s reaction=%s", feed_id, post_id, comment_id, subscriber_id, reaction)
		mochi.db.execute("replace into reactions ( feed, post, comment, subscriber, name, reaction ) values ( ?, ?, ?, ?, ?, ? )",
			feed_id, post_id, comment_id, subscriber_id, e.content("name"), reaction)
	else:
		mochi.log.info("Deleting comment reaction: feed=%s comment=%s subscriber=%s", feed_id, comment_id, subscriber_id)
		mochi.db.execute("delete from reactions where feed=? and comment=? and subscriber=?",
			feed_id, comment_id, subscriber_id)

	# Send WebSocket notification for real-time UI updates
	fingerprint = mochi.entity.fingerprint(feed_data["id"])
	if fingerprint:
		mochi.log.info("Sending WebSocket notification for comment reaction: fingerprint=%s", fingerprint)
		mochi.websocket.write(fingerprint, {"type": "react/comment", "feed": feed_data["id"], "post": post_id, "comment": comment_id, "sender": subscriber_id})
	else:
		mochi.log.info("No fingerprint found for WebSocket notification")

	# Create notification for subscriber about reaction (runs on subscriber's server)
	# Skip notifications for historical reactions synced during initial subscription
	if not e.content("sync") and subscriber_id != user_id and reaction and fingerprint:
		mochi.service.call("notifications", "send",
			"reaction",
			"New reaction",
			e.content("name") + " reacted " + reaction + " to a comment",
			comment_id,
			"/feeds/" + fingerprint
		)

# Handle post reaction submission from subscriber (owner receiving reaction)
def event_post_react_submit(e): # feeds_post_react_submit_event
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("to"))
	if not feed_data:
		mochi.log.info("Feed dropping post reaction submit for unknown feed")
		return
	feed_id = feed_data["id"]

	sender_id = e.header("from")
	post_id = e.content("post")
	name = e.content("name")
	
	if not mochi.valid(name, "name"):
		mochi.log.info("Feed dropping post reaction submit with invalid name")
		return

	# Verify post exists
	post_data = mochi.db.row("select * from posts where id=? and feed=?", post_id, feed_id)
	if not post_data:
		mochi.log.info("Feed dropping post reaction submit for unknown post '%s'", post_id)
		return

	# Verify sender is a subscriber
	sub_data = get_feed_subscriber(feed_data, sender_id)
	if not sub_data:
		mochi.log.info("Feed dropping post reaction submit from unknown subscriber '%s'", sender_id)
		return

	result = is_reaction_valid(e.content("reaction"))
	if not result["valid"]:
		mochi.log.info("Feed dropping invalid post reaction submit")
		return
	reaction = result["reaction"]

	# Store the reaction
	post_reaction_set(post_data, sender_id, name, reaction)

	# Send WebSocket notification to owner for real-time UI updates
	broadcast_websocket(feed_id, {"type": "react/post", "feed": feed_id, "post": post_id, "sender": sender_id})

	# Create notification for feed owner about reaction (runs on owner's server)
	if sender_id != feed_id and reaction:
		mochi.service.call("notifications", "send",
			"reaction",
			"New reaction",
			name + " reacted " + reaction + " to your post",
			post_id,
			"/feeds/" + mochi.entity.fingerprint(feed_data["id"])
		)

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
		mochi.log.info("Feed dropping comment reaction submit for unknown feed")
		return
	feed_id = feed_data["id"]

	sender_id = e.header("from")
	comment_id = e.content("comment")
	post_id = e.content("post")
	name = e.content("name")
	
	if not mochi.valid(name, "name"):
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

	# Verify sender is a subscriber
	sub_data = get_feed_subscriber(feed_data, sender_id)
	if not sub_data:
		mochi.log.info("Feed dropping comment reaction submit from unknown subscriber '%s'", sender_id)
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
	if sender_id != feed_id and reaction:
		mochi.service.call("notifications", "send",
			"reaction",
			"New reaction",
			name + " reacted " + reaction + " to a comment",
			comment_id,
			"/feeds/" + mochi.entity.fingerprint(feed_data["id"])
		)

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
	mochi.log.info("event_post_create: received from %s, post_id=%s", e.header("from"), e.content("id"))
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		mochi.log.info("Feed dropping post to unknown feed")
		return



	post = {"id": e.content("id"), "created": e.content("created"), "body": e.content("body")}

	# Validate timestamp is within reasonable range (not more than 1 day in future or 1 year in past)
	now = mochi.time.now()
	if post["created"] > now + 86400 or post["created"] < now - 31536000:
		mochi.log.info("Feed dropping post with invalid timestamp")
		return

	if not mochi.valid(post["id"], "id"):
		mochi.log.info("Feed dropping post with invalid ID '%s'", post["id"])
		return

	if mochi.db.exists("select id from posts where id=?", post["id"]):
		mochi.log.info("Feed dropping post with duplicate ID '%s'", post["id"])
		return

	if not mochi.valid(post["body"], "text"):
		mochi.log.info("Feed dropping post with invalid body '%s'", post["body"])
		return

	# Handle extended data (checkin, travelling, etc.)
	data = e.content("data")
	data_str = ""
	if data:
		if not validate_post_data(data):
			mochi.log.info("Feed dropping post with invalid data")
			return
		data_str = json.encode(data)

	mochi.db.execute("replace into posts ( id, feed, body, data, created, updated ) values ( ?, ?, ?, ?, ?, ? )", post["id"], feed_data["id"], post["body"], data_str, post["created"], post["created"])

	# Store attachment metadata from the event
	attachments = e.content("attachments") or []
	if attachments:
		mochi.attachment.store(attachments, e.header("from"), post["id"])

	set_feed_updated(feed_data["id"])

	# Track if this post came from a source feed
	sender_feed = e.header("from")
	source = mochi.db.row("select id from sources where type='feed/posts' and url=?", sender_feed)
	if source:
		mochi.db.execute("insert or ignore into source_posts (source, post, guid) values (?, ?, ?)",
			source["id"], post["id"], post["id"])

	# Send WebSocket notification for real-time UI updates
	fingerprint = mochi.entity.fingerprint(feed_data["id"])
	if fingerprint:
		sender_id = e.header("from")
		mochi.websocket.write(fingerprint, {"type": "post/create", "feed": feed_data["id"], "post": post["id"], "sender": sender_id})

	# Create notification for this subscriber about new post (runs on subscriber's server)
	# Skip notifications for historical posts synced during initial subscription
	if not e.content("sync"):
		feed_name = feed_data.get("name", "Feed")
		post_excerpt = post["body"][:50] + "..." if len(post["body"]) > 50 else post["body"]
		mochi.service.call("notifications", "send",
			"post",
			"New post",
			"New post in " + feed_name + ": " + post_excerpt,
			post["id"],
			"/feeds/" + fingerprint
		)


# Handle post edit event from feed owner (subscriber receiving edit)
def event_post_edit(e):
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		mochi.log.info("Feed dropping post edit for unknown feed")
		return

	post_id = e.content("post")
	body = e.content("body")
	edited = e.content("edited")
	data = e.content("data")

	if not mochi.valid(post_id, "id"):
		mochi.log.info("Feed dropping post edit with invalid post ID")
		return
	if not mochi.valid(body, "text"):
		mochi.log.info("Feed dropping post edit with invalid body")
		return

	post = mochi.db.row("select * from posts where id=? and feed=?", post_id, feed_data["id"])
	if not post:
		mochi.log.info("Feed dropping post edit for unknown post '%s'", post_id)
		return

	data_value = json.encode(data) if data else ""
	mochi.db.execute("update posts set body=?, data=?, updated=?, edited=? where id=?", body, data_value, edited, edited, post_id)

	# Update attachments from event
	attachments = e.content("attachments")
	if attachments != None:
		mochi.attachment.clear(post_id, [])
		if attachments:
			mochi.attachment.store(attachments, e.header("from"), post_id)

	set_feed_updated(feed_data["id"])

	# Send WebSocket notification for real-time UI updates
	fingerprint = mochi.entity.fingerprint(feed_data["id"])
	if fingerprint:
		sender_id = e.header("from")
		mochi.websocket.write(fingerprint, {"type": "post/edit", "feed": feed_data["id"], "post": post_id, "sender": sender_id})

# Handle post delete event from feed owner (subscriber receiving delete)
def event_post_delete(e):
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		mochi.log.info("Feed dropping post delete for unknown feed")
		return

	post_id = e.content("post")
	if not mochi.valid(post_id, "id"):
		mochi.log.info("Feed dropping post delete with invalid post ID")
		return

	post = mochi.db.row("select * from posts where id=? and feed=?", post_id, feed_data["id"])
	if not post:
		mochi.log.info("Feed dropping post delete for unknown post '%s'", post_id)
		return

	mochi.db.execute("delete from reactions where post=?", post_id)
	mochi.db.execute("delete from comments where post=?", post_id)
	mochi.attachment.clear(post_id, [])
	mochi.db.execute("delete from posts where id=?", post_id)
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
		mochi.log.info("Feed dropping comment edit for unknown feed")
		return

	comment_id = e.content("comment")
	post_id = e.content("post")
	body = e.content("body")
	edited = e.content("edited")

	if not mochi.valid(comment_id, "id"):
		mochi.log.info("Feed dropping comment edit with invalid comment ID")
		return
	if not mochi.valid(body, "text"):
		mochi.log.info("Feed dropping comment edit with invalid body")
		return

	comment = mochi.db.row("select * from comments where id=? and feed=?", comment_id, feed_data["id"])
	if not comment:
		mochi.log.info("Feed dropping comment edit for unknown comment '%s'", comment_id)
		return

	mochi.db.execute("update comments set body=?, edited=? where id=?", body, edited, comment_id)
	set_post_updated(post_id)
	set_feed_updated(feed_data["id"])

	# Send WebSocket notification for real-time UI updates
	fingerprint = mochi.entity.fingerprint(feed_data["id"])
	if fingerprint:
		sender_id = e.header("from")
		mochi.websocket.write(fingerprint, {"type": "comment/edit", "feed": feed_data["id"], "post": post_id, "comment": comment_id, "sender": sender_id})

# Handle comment delete event from feed owner (subscriber receiving delete)
def event_comment_delete(e):
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		mochi.log.info("Feed dropping comment delete for unknown feed")
		return

	comment_id = e.content("comment")
	post_id = e.content("post")

	if not mochi.valid(comment_id, "id"):
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
	if not mochi.valid(e.content("name"), "name"):
		mochi.log.info("Feed dropping post reaction with invalid name '%s'", )
		return
	
	post_data = mochi.db.row("select * from posts where id=?", e.content("post"))
	if not post_data:
		mochi.log.info("Feed dropping post reaction for unknown comment")
		return
	post_id = post_data["id"]

	feed_data = feed_by_id(user_id, post_data["feed"])
	if not feed_data:
		mochi.log.info("Feed dropping post reaction for unknown feed")
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
		mochi.websocket.write(fingerprint, {"type": "react/post", "feed": feed_data["id"], "post": post_id, "sender": subscriber_id})

	# Create notification for subscriber about reaction (runs on subscriber's server)
	# Skip notifications for historical reactions synced during initial subscription
	if not e.content("sync") and subscriber_id != user_id and reaction and fingerprint:
		mochi.service.call("notifications", "send",
			"reaction",
			"New reaction",
			e.content("name") + " reacted " + reaction + " to a post",
			post_id,
			"/feeds/" + fingerprint
		)

# Handle feed info request from remote server (stream-based)
def event_info(e):
	user_id = e.user.identity.id if e.user and e.user.identity else None
	feed_id = e.header("to")

	# Get entity info (no user restriction)
	entity = mochi.entity.info(feed_id)
	if not entity or entity.get("class") != "feed":
		e.stream.write({"error": "Feed not found"})
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
		e.stream.write({"error": "Feed not found"})
		return

	posts = mochi.db.rows("select id, body, data, created, updated, edited, up, down from posts where feed=? order by created desc limit 1000", feed_id) or []
	comments = mochi.db.rows("select id, post, parent, subscriber, name, body, created, edited from comments where feed=? order by created", feed_id) or []
	reactions = mochi.db.rows("select post, comment, subscriber, name, reaction from reactions where feed=?", feed_id) or []

	e.stream.write({
		"posts": posts,
		"comments": comments,
		"reactions": reactions,
	})

# Insert feed schema data into local database
def insert_feed_schema(feed_id, schema):
	for p in (schema.get("posts") or []):
		mochi.db.execute(
			"insert or ignore into posts (id, feed, body, data, created, updated, edited, up, down) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
			p.get("id", ""), feed_id, p.get("body", ""), p.get("data", ""),
			p.get("created", 0), p.get("updated", 0), p.get("edited", 0),
			p.get("up", 0), p.get("down", 0)
		)
	for c in (schema.get("comments") or []):
		mochi.db.execute(
			"insert or ignore into comments (id, feed, post, parent, subscriber, name, body, created, edited) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
			c.get("id", ""), feed_id, c.get("post", ""), c.get("parent", ""),
			c.get("subscriber", ""), c.get("name", ""), c.get("body", ""),
			c.get("created", 0), c.get("edited", 0)
		)
	for r in (schema.get("reactions") or []):
		mochi.db.execute(
			"insert or ignore into reactions (feed, post, comment, subscriber, name, reaction) values (?, ?, ?, ?, ?, ?)",
			feed_id, r.get("post", ""), r.get("comment", ""),
			r.get("subscriber", ""), r.get("name", ""), r.get("reaction", "")
		)

def event_subscribe(e): # feeds_subscribe_event
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("to"))
	if not feed_data:
		return

	name = e.content("name")
	if not mochi.valid(name, "line"):
		return

	mochi.db.execute("insert or ignore into subscribers ( feed, id, name ) values ( ?, ?, ? )", feed_data["id"], e.header("from"), name)
	mochi.db.execute("update feeds set subscribers=(select count(*) from subscribers where feed=? and system=0), updated=? where id=?", feed_data["id"], mochi.time.now(), feed_data["id"])

	feed_update(user_id, feed_data)
	
	# Send WebSocket notification for real-time UI updates
	fingerprint = mochi.entity.fingerprint(feed_data["id"])
	if fingerprint:
		mochi.websocket.write(fingerprint, {"type": "feed/update", "feed": feed_data["id"]})

	send_recent_posts(user_id, feed_data, e.header("from"))



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

	# Revoke all access
	resource = "feed/" + e.header("to")
	for op in ["view", "post", "comment", "react", "manage", "*"]:
		mochi.access.revoke(member_id, resource, op)

	feed_update(user_id, feed_data)

	# Send WebSocket notification for real-time UI updates
	fingerprint = mochi.entity.fingerprint(feed_data["id"])
	if fingerprint:
		mochi.websocket.write(fingerprint, {"type": "feed/update", "feed": feed_data["id"]})

# Handle notification that a feed has been deleted by its owner
def event_deleted(e):
	feed_id = e.content("feed")
	if not feed_id:
		feed_id = e.header("from")

	# Delete local subscription data for this feed
	mochi.db.execute("delete from reactions where feed=?", feed_id)
	mochi.db.execute("delete from comments where feed=?", feed_id)
	mochi.db.execute("delete from posts where feed=?", feed_id)
	mochi.db.execute("delete from subscribers where feed=?", feed_id)
	mochi.db.execute("delete from feeds where id=?", feed_id)

def event_update(e): # feeds_update_event
	feed_id = e.header("from")
	feed = mochi.db.row("select * from feeds where id=? and owner=0", feed_id)
	if not feed:
		return

	# Handle name update
	name = e.content("name")
	if name:
		mochi.db.execute("update feeds set name=?, updated=? where id=?", name, mochi.time.now(), feed_id)
		return

	# Handle subscriber count update
	subscribers = e.content("subscribers", "0")
	if not mochi.valid(subscribers, "natural"):
		mochi.log.info("Feed dropping update with invalid number of subscribers '%s'", subscribers)
		return

	mochi.db.execute("update feeds set subscribers=?, updated=? where id=?", subscribers, mochi.time.now(), feed_id)

# Handle view request from non-subscriber (stream-based request/response)
def event_view(e):
	user_id = e.user.identity.id if e.user and e.user.identity else None
	feed_id = e.header("to")

	# Get entity info (no user restriction) - for feeds we own
	entity = mochi.entity.info(feed_id)
	if not entity or entity.get("class") != "feed":
		e.stream.write({"error": "Feed not found"})
		return

	feed_name = entity.get("name", "")
	feed_fingerprint = entity.get("fingerprint", mochi.entity.fingerprint(feed_id))
	feed_privacy = entity.get("privacy", "public")

	# Check access for private feeds
	requester = e.header("from")
	if feed_privacy == "private":
		if not check_event_access(requester, feed_id, "view"):
			e.stream.write({"error": "Not authorized to view this feed"})
			return

	# NOTE: We do NOT auto-subscribe viewers. Permissions are determined solely by
	# check_event_access which respects ACLs like "+" (Authenticated users).
	# Users must explicitly subscribe to receive updates.

	# Get posts for this feed
	posts = mochi.db.rows("select * from posts where feed=? order by created desc limit 100", feed_id)

	# Format posts with comments and reactions
	formatted_posts = []
	for post in posts:
		post_data = dict(post)
		post_data["feed_fingerprint"] = feed_fingerprint
		post_data["feed_name"] = feed_name
		if post.get("format", "markdown") == "markdown":
			post_data["body_markdown"] = mochi.markdown.render(post["body"])
		post_data["attachments"] = mochi.attachment.list(post["id"], feed_id)
		# Decode JSON data field
		if post_data.get("data"):
			post_data["data"] = json.decode(post_data["data"])
		else:
			post_data["data"] = {}
		post_data["my_reaction"] = ""
		post_data["reactions"] = mochi.db.rows("select * from reactions where post=? and comment='' and reaction!='' order by name", post["id"])
		post_data["comments"] = feed_comments(user_id, post_data, None, 0)
		formatted_posts.append(post_data)

	# Calculate permissions for the requester
	permissions = {
		"view": True,
		"react": check_event_access(requester, feed_id, "react"),
		"comment": check_event_access(requester, feed_id, "comment"),
		"manage": False,  # Remote users cannot manage
	}

	e.stream.write({
		"name": feed_name,
		"fingerprint": feed_fingerprint,
		"privacy": feed_privacy,
		"posts": formatted_posts,
		"permissions": permissions,
	})

# Handle attachment view request from non-subscriber (stream-based request/response)
def event_attachment_view(e):
	user = e.user.identity.id if e.user and e.user.identity else None
	feed = e.header("to")

	# Read request data from event content (parsed by stream protocol layer)
	attachment = e.content("attachment")

	# Get feed data - check if we own this feed
	feed_row = mochi.db.row("select * from feeds where id=?", feed)
	if not feed_row:
		e.stream.write({"status": "404", "error": "Feed not found"})
		return

	# Check access for private feeds
	requester = e.header("from")
	if feed_row.get("privacy") == "private":
		if not check_event_access(requester, feed, "view"):
			e.stream.write({"status": "403", "error": "Not authorized to view this feed"})
			return

	# Find the attachment by searching through posts in this feed
	posts = mochi.db.rows("select id from posts where feed=?", feed)
	found = None
	for post in posts:
		attachments = mochi.attachment.list(post["id"])
		for att in attachments:
			if att.get("id") == attachment:
				found = att
				break
		if found:
			break

	if not found:
		e.stream.write({"status": "404", "error": "Attachment not found"})
		return

	# Check if thumbnail was requested
	want_thumbnail = e.content("thumbnail")

	# Get attachment file path
	if want_thumbnail:
		path = mochi.attachment.thumbnail.path(attachment)
		if not path:
			# Fall back to original if no thumbnail available
			path = mochi.attachment.path(attachment)
	else:
		path = mochi.attachment.path(attachment)

	if not path:
		e.stream.write({"status": "404", "error": "Could not find attachment file"})
		return

	# Send success status with content type, then stream the file directly
	content_type = found.get("type", "application/octet-stream")
	if want_thumbnail:
		content_type = "image/jpeg"  # Thumbnails are always JPEG
	e.stream.write({"status": "200", "content_type": content_type})
	e.stream.write_from_file(path)

# Handle comment add request (stream-based request/response)
def event_comment_add(e):
	user_id = e.user.identity.id if e.user and e.user.identity else None
	feed_id = e.header("to")
	commenter_id = e.header("from")

	# Get feed data
	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		e.stream.write({"error": "Feed not found: " + str(feed_id)})
		return

	# Check if commenter has permission to comment
	if not check_event_access(commenter_id, feed_id, "comment"):
		e.stream.write({"error": "You don't have permission to comment"})
		return

	# Validate post exists
	post_id = e.content("post")
	if not mochi.db.exists("select id from posts where id=? and feed=?", post_id, feed_id):
		e.stream.write({"error": "Post not found"})
		return

	# Validate parent if provided
	parent_id = e.content("parent") or ""
	if parent_id:
		parent = mochi.db.row("select * from comments where id=?", parent_id)
		if not parent:
			e.stream.write({"error": "Parent comment not found"})
			return
		# Ensure we reply to the correct post thread - trust the parent's post ID
		post_id = parent["post"]

	# Validate body
	body = e.content("body")
	if not mochi.valid(body, "text"):
		e.stream.write({"error": "Invalid comment body"})
		return

	# Validate commenter name
	name = e.content("name")
	if not mochi.valid(name, "name"):
		e.stream.write({"error": "Invalid name"})
		return

	# Generate comment ID
	uid = mochi.uid()
	if mochi.db.exists("select id from comments where id=?", uid):
		e.stream.write({"error": "Duplicate ID"})
		return

	now = mochi.time.now()

	# Store the comment
	mochi.db.execute("insert into comments (id, feed, post, parent, subscriber, name, body, created) values (?, ?, ?, ?, ?, ?, ?, ?)",
		uid, feed_id, post_id, parent_id, commenter_id, name, body, now)
	set_post_updated(post_id)
	set_feed_updated(feed_id)

	# Send WebSocket notification to owner for real-time UI updates
	broadcast_websocket(feed_id, {"type": "comment/create", "feed": feed_id, "post": post_id, "comment": uid, "sender": commenter_id})

	# Create notification for feed owner about new comment (runs on owner's server)
	feed_name = feed_data.get("name", "Feed")
	comment_excerpt = body[:50] + "..." if len(body) > 50 else body
	fingerprint = mochi.entity.fingerprint(feed_data["id"])

	if feed_id != commenter_id:
		mochi.service.call("notifications", "send",
			"comment",
			"New comment",
			name + " commented: " + comment_excerpt,
			uid,
			"/feeds/" + fingerprint
		)

	# Note: P2P broadcast_event is skipped here because mochi.message.send requires
	# the "from" entity to belong to the current user context. In stream-based event
	# handlers, this constraint causes "invalid from header" errors. Subscribers will
	# receive the comment via WebSocket or on their next sync.

	e.stream.write({"id": uid})

# Handle post reaction add request (stream-based request/response)
def event_post_react_add(e):
	user_id = e.user.identity.id if e.user and e.user.identity else None
	feed_id = e.header("to")
	reactor_id = e.header("from")

	# Get feed data
	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		e.stream.write({"error": "Feed not found"})
		return

	# Check if reactor has permission to react
	if not check_event_access(reactor_id, feed_id, "react"):
		e.stream.write({"error": "You don't have permission to react"})
		return

	# Validate post exists
	post_id = e.content("post")
	post_data = mochi.db.row("select * from posts where id=? and feed=?", post_id, feed_id)
	if not post_data:
		e.stream.write({"error": "Post not found"})
		return

	# Validate reaction
	result = is_reaction_valid(e.content("reaction"))
	if not result["valid"]:
		e.stream.write({"error": "Invalid reaction"})
		return
	reaction = result["reaction"]

	# Validate name
	name = e.content("name")
	if not mochi.valid(name, "name"):
		e.stream.write({"error": "Invalid name"})
		return

	# Store the reaction
	post_reaction_set(post_data, reactor_id, name, reaction)

	# Send WebSocket notification to owner for real-time UI updates
	broadcast_websocket(feed_id, {"type": "react/post", "feed": feed_id, "post": post_id, "sender": reactor_id})

	# Note: P2P broadcast_event is skipped here (see event_comment_add for explanation)

	e.stream.write({"success": True})

# Handle comment reaction add request (stream-based request/response)
def event_comment_react_add(e):
	user_id = e.user.identity.id if e.user and e.user.identity else None
	feed_id = e.header("to")
	reactor_id = e.header("from")

	# Get feed data
	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		e.stream.write({"error": "Feed not found"})
		return

	# Check if reactor has permission to react
	if not check_event_access(reactor_id, feed_id, "react"):
		e.stream.write({"error": "You don't have permission to react"})
		return

	# Validate comment exists
	comment_id = e.content("comment")
	comment_data = mochi.db.row("select * from comments where id=?", comment_id)
	if not comment_data:
		e.stream.write({"error": "Comment not found"})
		return
	if comment_data["feed"] != feed_id:
		e.stream.write({"error": "Comment belongs to different feed"})
		return

	# Validate reaction
	result = is_reaction_valid(e.content("reaction"))
	if not result["valid"]:
		e.stream.write({"error": "Invalid reaction"})
		return
	reaction = result["reaction"]

	# Validate name
	name = e.content("name")
	if not mochi.valid(name, "name"):
		e.stream.write({"error": "Invalid name"})
		return

	# Store the reaction
	comment_reaction_set(comment_data, reactor_id, name, reaction)

	# Send WebSocket notification to owner for real-time UI updates
	broadcast_websocket(feed_id, {"type": "react/comment", "feed": feed_id, "post": comment_data["post"], "comment": comment_id, "sender": reactor_id})

	# Note: P2P broadcast_event is skipped here (see event_comment_add for explanation)

	e.stream.write({"success": True})

# OPEN GRAPH

# Generate Open Graph meta tags for feed pages
def opengraph_feed(params):
	feed_id = params.get("feed", "")
	post_id = params.get("post", "")

	# Default values
	og = {
		"title": "Feeds",
		"description": "A feed on Mochi",
		"type": "website"
	}

	# Look up feed by ID or fingerprint
	feed = None
	if feed_id:
		feed = mochi.db.row("select * from feeds where id=?", feed_id)
		if not feed:
			# Try to find by fingerprint
			rows = mochi.db.rows("select * from feeds")
			for r in rows:
				if mochi.entity.fingerprint(r["id"]) == feed_id or mochi.entity.fingerprint(r["id"], True) == feed_id:
					feed = r
					break

	if feed:
		og["title"] = feed["name"]
		og["description"] = feed["name"] + " on Mochi"

		# If specific post requested, use post content
		if post_id:
			post = mochi.db.row("select * from posts where id=?", post_id)
			if post:
				og["type"] = "article"
				# Use first 200 chars of post body as description
				body = post["body"]
				if len(body) > 200:
					body = body[:197] + "..."
				og["description"] = body
				og["title"] = feed["name"] + ": Post"

				# Check for image attachment
				attachments = mochi.attachment.list(post_id)
				for att in attachments:
					if att.get("type", "").startswith("image/"):
						og["image"] = "-/attachments/" + att["id"]
						break
		else:
			# No specific post - check most recent post for image
			recent = mochi.db.row("select id from posts where feed=? order by created desc limit 1", feed["id"])
			if recent:
				attachments = mochi.attachment.list(recent["id"])
				for att in attachments:
					if att.get("type", "").startswith("image/"):
						og["image"] = "-/attachments/" + att["id"]
						break

	return og

# CROSS-APP PROXY ACTIONS

# Proxy user search to people app
def action_users_search(a):
	if not a.user:
		a.error(401, "Not logged in")
		return
	query = a.input("search", "")
	results = mochi.service.call("friends", "users/search", query)
	return {"data": {"results": results}}

# Proxy groups list to people app
def action_groups(a):
	if not a.user:
		a.error(401, "Not logged in")
		return
	groups = mochi.service.call("friends", "groups/list")
	return {"data": {"groups": groups}}

# SOURCES

# List sources for a feed (owner only)
def action_sources_list(a):
	if not a.user:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id

	feed = get_feed(a)
	if not feed:
		a.error(404, "Feed not found")
		return

	if not is_feed_owner(user_id, feed):
		a.error(403, "Access denied")
		return

	sources = mochi.db.rows("select * from sources where feed=? order by name", feed["id"])
	return {"data": {"sources": sources}}

# Add a source to a feed (owner only)
def action_sources_add(a):
	if not a.user:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id

	feed = get_feed(a)
	if not feed:
		a.error(404, "Feed not found")
		return
	feed_id = feed["id"]

	if not is_feed_owner(user_id, feed):
		a.error(403, "Access denied")
		return

	source_type = a.input("type")
	url = a.input("url")
	name = a.input("name")

	if not source_type or not url:
		a.error(400, "Type and URL are required")
		return

	if source_type == "rss":
		return sources_add_rss(a, feed, url, name)
	elif source_type == "feed/posts":
		return sources_add_feed(a, feed, url, name)
	else:
		a.error(400, "Invalid source type")
		return

# Add an RSS source
def sources_add_rss(a, feed, url, name):
	feed_id = feed["id"]

	# Validate URL format
	if not url.startswith("http://") and not url.startswith("https://"):
		a.error(400, "URL must start with http:// or https://")
		return

	# Check for duplicate URL
	if mochi.db.exists("select 1 from sources where feed=? and url=?", feed_id, url):
		a.error(400, "Source already exists")
		return

	# Fetch the RSS feed to validate and get initial items
	result = mochi.rss.fetch(url, {})
	status = result["status"]

	if status == 0:
		a.error(502, "Unable to fetch feed")
		return
	if status < 200 or status >= 300:
		a.error(502, "Feed returned status " + str(status))
		return

	# Use feed title as name if not provided
	if not name:
		name = result.get("title", "")
	if not name:
		name = url

	source_id = mochi.uid()
	now = mochi.time.now()
	ttl = result.get("ttl", 0)
	etag = result.get("headers", {}).get("etag", "")
	modified = result.get("headers", {}).get("last-modified", "")
	base = 900  # 15 minutes default
	max_interval = 86400  # 24 hours

	mochi.db.execute("insert into sources (id, feed, type, url, name, base, max, interval, next, jitter, changed, etag, modified, ttl, fetched) values (?, ?, 'rss', ?, ?, ?, ?, ?, ?, 60, ?, ?, ?, ?, ?)",
		source_id, feed_id, url, name, base, max_interval, base, now + base + 60, now, etag, modified, ttl, now)

	# Ingest initial items
	items = result.get("items", [])
	count = ingest_rss_items(source_id, feed_id, items)

	# Schedule next poll
	mochi.schedule.after("sources/poll", {"feed": feed_id}, base)

	source = mochi.db.row("select * from sources where id=?", source_id)
	return {"data": {"source": source, "ingested": count}}

# Add a Mochi feed source
def sources_add_feed(a, feed, source_feed_id, name):
	feed_id = feed["id"]

	if not mochi.valid(source_feed_id, "entity") and not mochi.valid(source_feed_id, "fingerprint"):
		a.error(400, "Invalid feed ID")
		return

	# Resolve fingerprint to entity ID
	resolved_id = resolve_feed_id(source_feed_id)
	if not resolved_id:
		a.error(404, "Source feed not found")
		return

	# Can't add self as source
	if resolved_id == feed_id:
		a.error(400, "Cannot add own feed as source")
		return

	# Check for duplicate
	if mochi.db.exists("select 1 from sources where feed=? and url=?", feed_id, resolved_id):
		a.error(400, "Source already exists")
		return

	# Subscribe to the source feed via the existing mechanism
	server = a.input("server")

	# Get feed info from directory if no server
	schema = None
	feed_name = name
	if server:
		peer = mochi.remote.peer(server)
		if not peer:
			a.error(502, "Unable to connect to server")
			return
		response = mochi.remote.request(resolved_id, "feeds", "info", {"feed": resolved_id}, peer)
		if response.get("error"):
			a.error(response.get("code", 404), response["error"])
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

	if not feed_name:
		feed_name = resolved_id

	# Create the feed entry and subscriber (reusing subscribe logic)
	mochi.db.execute("replace into feeds (id, name, owner, subscribers, updated, server) values (?, ?, 0, 0, ?, ?)",
		resolved_id, feed_name, mochi.time.now(), server or "")
	user_id = a.user.identity.id
	mochi.db.execute("replace into subscribers (feed, id, name, system) values (?, ?, ?, 1)",
		resolved_id, user_id, a.user.identity.name)

	# Update subscriber count (excluding system subscribers)
	mochi.db.execute("update feeds set subscribers=(select count(*) from subscribers where feed=? and system=0), updated=? where id=?",
		resolved_id, mochi.time.now(), resolved_id)

	# Insert schema data for immediate availability
	if schema and not schema.get("error"):
		insert_feed_schema(resolved_id, schema)

	# Send P2P subscribe message
	mochi.message.send(headers(user_id, resolved_id, "subscribe"), {"name": a.user.identity.name})

	# Create source record
	source_id = mochi.uid()
	now = mochi.time.now()
	mochi.db.execute("insert into sources (id, feed, type, url, name, fetched) values (?, ?, 'feed/posts', ?, ?, ?)",
		source_id, feed_id, resolved_id, feed_name, now)

	source = mochi.db.row("select * from sources where id=?", source_id)
	return {"data": {"source": source, "ingested": 0}}

# Remove a source from a feed (owner only)
def action_sources_remove(a):
	if not a.user:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id

	feed = get_feed(a)
	if not feed:
		a.error(404, "Feed not found")
		return
	feed_id = feed["id"]

	if not is_feed_owner(user_id, feed):
		a.error(403, "Access denied")
		return

	source_id = a.input("source")
	if not source_id:
		a.error(400, "Source ID is required")
		return

	source = mochi.db.row("select * from sources where id=? and feed=?", source_id, feed_id)
	if not source:
		a.error(404, "Source not found")
		return

	delete_posts = a.input("delete_posts") == "true"

	# For feed/posts type, unsubscribe from the source feed
	if source["type"] == "feed/posts":
		source_feed_id = source["url"]
		# Send P2P unsubscribe
		mochi.message.send(headers(user_id, source_feed_id, "unsubscribe"))
		# Clean up local subscription data
		mochi.db.execute("delete from subscribers where feed=? and id=?", source_feed_id, user_id)

	# Optionally delete associated posts
	if delete_posts:
		post_ids = mochi.db.rows("select post from source_posts where source=?", source_id)
		for row in post_ids:
			mochi.attachment.clear(row["post"])
			mochi.db.execute("delete from reactions where post=?", row["post"])
			mochi.db.execute("delete from comments where post=?", row["post"])
			mochi.db.execute("delete from posts where id=?", row["post"])

	# Delete source_posts records
	mochi.db.execute("delete from source_posts where source=?", source_id)

	# Delete source
	mochi.db.execute("delete from sources where id=?", source_id)

	# Cancel scheduled polls for this feed
	scheduled = mochi.schedule.list()
	for se in scheduled:
		if se.event == "sources/poll" and se.data.get("feed") == feed_id:
			se.cancel()

	return {"data": {"success": True}}

# Ingest RSS items into posts and source_posts tables
def ingest_rss_items(source_id, feed_id, items):
	count = 0
	now = mochi.time.now()

	for item in items:
		guid = item.get("guid", "")
		if not guid:
			guid = item.get("link", "")
		if not guid:
			continue

		# Skip duplicates
		if mochi.db.exists("select 1 from source_posts where source=? and guid=?", source_id, guid):
			continue

		# Format post body - strip HTML from description
		title = item.get("title", "")
		description = strip_html(item.get("description", ""))
		link = item.get("link", "")
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

		# Use published timestamp or now
		created = item.get("published", 0)
		if not created or created <= 0:
			created = now

		post_id = mochi.uid()
		mochi.db.execute("insert into posts (id, feed, body, data, format, created, updated) values (?, ?, ?, '', 'text', ?, ?)",
			post_id, feed_id, body, created, created)
		mochi.db.execute("insert into source_posts (source, post, guid) values (?, ?, ?)",
			source_id, post_id, guid)

		count = count + 1

	if count > 0:
		set_feed_updated(feed_id)
		# Notify subscribers about new posts
		subscribers = mochi.db.rows("select id from subscribers where feed=?", feed_id)
		for sub in subscribers:
			broadcast_websocket(feed_id, {"type": "post/create", "feed": feed_id})

	return count

# Poll a single RSS source for new items
def poll_rss_source(source):
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
		new_count = ingest_rss_items(source_id, feed_id, items)

		# Update cache headers
		new_etag = result.get("headers", {}).get("etag", "")
		new_modified = result.get("headers", {}).get("last-modified", "")
		new_ttl = result.get("ttl", 0)
		mochi.db.execute("update sources set etag=?, modified=?, ttl=? where id=?",
			new_etag, new_modified, new_ttl, source_id)

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

	# Update source with new interval and next poll time
	jitter = source["jitter"]
	next_poll = now + new_interval + (mochi.time.now() % max(jitter, 1))
	mochi.db.execute("update sources set interval=?, next=?, fetched=? where id=?",
		new_interval, next_poll, now, source_id)

	return new_count

# Manual poll trigger (owner only)
def action_sources_poll(a):
	if not a.user:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id

	feed = get_feed(a)
	if not feed:
		a.error(404, "Feed not found")
		return
	feed_id = feed["id"]

	if not is_feed_owner(user_id, feed):
		a.error(403, "Access denied")
		return

	source_id = a.input("source")
	fetched = 0

	if source_id:
		# Poll a specific source
		source = mochi.db.row("select * from sources where id=? and feed=? and type='rss'", source_id, feed_id)
		if not source:
			a.error(404, "RSS source not found")
			return
		fetched = poll_rss_source(source)
	else:
		# Poll all RSS sources for this feed
		sources = mochi.db.rows("select * from sources where feed=? and type='rss'", feed_id)
		for source in sources:
			fetched = fetched + poll_rss_source(source)

	return {"data": {"fetched": fetched}}

# Scheduled poll handler - runs via mochi.schedule
def event_sources_poll(e):
	if e.source != "schedule":
		return

	data = e.data
	feed_id = data.get("feed", "")
	if not feed_id:
		return

	now = mochi.time.now()

	# Poll all RSS sources that are due
	sources = mochi.db.rows("select * from sources where feed=? and type='rss' and next<=?", feed_id, now)
	for source in sources:
		poll_rss_source(source)

	# Schedule next poll based on earliest next time
	earliest = mochi.db.row("select min(next) as next from sources where feed=? and type='rss'", feed_id)
	if earliest and earliest["next"]:
		next_time = earliest["next"]
		delay = next_time - mochi.time.now()
		if delay < 10:
			delay = 10
		mochi.schedule.after("sources/poll", {"feed": feed_id}, delay)

# Notification proxy actions - forward to notifications service

def action_notifications_subscribe(a):
	"""Create a notification subscription via the notifications service."""
	label = a.input("label", "").strip()
	type = a.input("type", "").strip()
	object = a.input("object", "").strip()
	destinations = a.input("destinations", "")

	if not label:
		a.error(400, "label is required")
		return
	if not mochi.valid(label, "text"):
		a.error(400, "Invalid label")
		return

	destinations_list = json.decode(destinations) if destinations else []

	result = mochi.service.call("notifications", "subscribe", label, type, object, destinations_list)
	return {"data": {"id": result}}

def action_notifications_check(a):
	"""Check if a notification subscription exists for this app."""
	app = a.input("app") or "feeds"
	result = mochi.service.call("notifications", "subscriptions")
	# Filter subscriptions by app
	filtered = [sub for sub in result if sub.get("app") == app]
	return {"data": {"exists": len(filtered) > 0}}

def action_notifications_destinations(a):
	"""List available notification destinations."""
	result = mochi.service.call("notifications", "destinations")
	return {"data": result}

# RSS

# Escape special XML characters
def escape_xml(s):
	if not s:
		return ""
	s = s.replace("&", "&amp;")
	s = s.replace("<", "&lt;")
	s = s.replace(">", "&gt;")
	s = s.replace('"', "&quot;")
	return s

# Get or create an RSS token for an entity+mode combination
def action_rss_token(a):
	if not a.user:
		a.error(401, "Authentication required")
		return

	entity = a.input("entity")
	mode = a.input("mode")
	if not entity or not mode:
		a.error(400, "Missing entity or mode")
		return
	if mode != "posts" and mode != "all":
		a.error(400, "Mode must be 'posts' or 'all'")
		return

	user_id = a.user.identity.id

	if entity == "*":
		feed_id = "*"
	else:
		feed_data = feed_by_id(user_id, entity)
		if not feed_data:
			a.error(404, "Feed not found")
			return
		feed_id = feed_data["id"]

	# Check existing token
	existing = mochi.db.row("select token from rss where entity=? and mode=?", feed_id, mode)
	if existing:
		return {"data": {"token": existing["token"]}}

	# Create new token
	token = mochi.token.create("rss", ["rss"])
	if not token:
		a.error(500, "Failed to create token")
		return

	now = mochi.time.now()
	mochi.db.execute("insert into rss (token, entity, mode, created) values (?, ?, ?, ?)", token, feed_id, mode, now)
	return {"data": {"token": token}}

# Serve RSS feed for all subscribed feeds
def action_rss_all(a):
	if not a.user:
		a.error(401, "Authentication required")
		return

	user_id = a.user.identity.id

	# Look up mode from token
	token = a.input("token")
	mode = "posts"
	if token:
		rss_row = mochi.db.row("select mode from rss where token=? and entity='*'", token)
		if rss_row:
			mode = rss_row["mode"]

	a.header("Content-Type", "application/rss+xml; charset=utf-8")
	a.print('<?xml version="1.0" encoding="UTF-8"?>\n')
	a.print('<rss version="2.0">\n')
	a.print('<channel>\n')
	a.print('<title>All feeds</title>\n')
	a.print('<link>/feeds</link>\n')
	a.print('<description>All subscribed feeds</description>\n')

	# Build feed name lookup
	feed_names = {}
	all_feeds = mochi.db.rows("select id, name from feeds")
	for f in all_feeds:
		feed_names[f["id"]] = f["name"]

	if mode == "all":
		rows = mochi.db.rows("""
			select 'post' as type, p.id, p.feed, '' as author, p.body, p.created
			from posts p inner join subscribers s on p.feed = s.feed
			where s.id = ?
			union all
			select 'comment' as type, c.id, c.feed, c.name as author, c.body, c.created
			from comments c inner join subscribers s on c.feed = s.feed
			where s.id = ?
			order by created desc limit 100
		""", user_id, user_id)
	else:
		rows = mochi.db.rows("""
			select 'post' as type, p.id, p.feed, '' as author, p.body, p.created
			from posts p inner join subscribers s on p.feed = s.feed
			where s.id = ?
			order by p.created desc limit 50
		""", user_id)

	if rows:
		a.print('<lastBuildDate>' + mochi.time.local(rows[0]["created"], "rfc822") + '</lastBuildDate>\n')

	for row in rows:
		item_id = row["id"]
		feed_id = row["feed"]
		feed_fp = mochi.entity.fingerprint(feed_id) if mochi.valid(feed_id, "entity") else feed_id
		item_fp = mochi.entity.fingerprint(item_id) if mochi.valid(item_id, "entity") else item_id
		feed_name = feed_names.get(feed_id, "Feed")
		body = row["body"]
		if len(body) > 500:
			body = body[:500] + "..."

		if row["type"] == "comment":
			title = feed_name + ": Comment by " + row["author"]
		else:
			title = feed_name

		link = "/feeds/" + feed_fp + "/-/" + item_fp

		a.print('<item>\n')
		a.print('<title>' + escape_xml(title) + '</title>\n')
		a.print('<link>' + escape_xml(link) + '</link>\n')
		a.print('<description>' + escape_xml(body) + '</description>\n')
		a.print('<pubDate>' + mochi.time.local(row["created"], "rfc822") + '</pubDate>\n')
		a.print('<guid isPermaLink="false">' + escape_xml(item_id) + '</guid>\n')
		a.print('</item>\n')

	a.print('</channel>\n')
	a.print('</rss>')

# Serve RSS feed for an entity
def action_rss(a):
	if not a.user:
		a.error(401, "Authentication required")
		return

	feed_id = a.input("feed")
	if not feed_id:
		a.error(400, "No feed specified")
		return

	user_id = a.user.identity.id
	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		a.error(404, "Feed not found")
		return

	feed_id = feed_data["id"]
	if not check_access(a, feed_id, "view"):
		a.error(403, "Not authorized to view this feed")
		return

	# Look up mode from token
	token = a.input("token")
	mode = "posts"
	if token:
		rss_row = mochi.db.row("select mode from rss where token=? and entity=?", token, feed_id)
		if rss_row:
			mode = rss_row["mode"]

	feed_name = feed_data.get("name", "Feed")
	fingerprint = mochi.entity.fingerprint(feed_id)

	a.header("Content-Type", "application/rss+xml; charset=utf-8")
	a.print('<?xml version="1.0" encoding="UTF-8"?>\n')
	a.print('<rss version="2.0">\n')
	a.print('<channel>\n')
	a.print('<title>' + escape_xml(feed_name) + '</title>\n')
	a.print('<link>/feeds/' + escape_xml(fingerprint) + '</link>\n')
	a.print('<description>' + escape_xml(feed_name) + ' RSS feed</description>\n')

	if mode == "all":
		# Interleave posts and comments by date
		rows = mochi.db.rows("""
			select 'post' as type, id, '' as author, body, created from posts where feed=?
			union all
			select 'comment' as type, id, name as author, body, created from comments where feed=?
			order by created desc limit 100
		""", feed_id, feed_id)
	else:
		rows = mochi.db.rows("select 'post' as type, id, '' as author, body, created from posts where feed=? order by created desc limit 50", feed_id)

	if rows:
		a.print('<lastBuildDate>' + mochi.time.local(rows[0]["created"], "rfc822") + '</lastBuildDate>\n')

	for row in rows:
		item_id = row["id"]
		item_fp = mochi.entity.fingerprint(item_id) if mochi.valid(item_id, "entity") else item_id
		body = row["body"]
		if len(body) > 500:
			body = body[:500] + "..."

		if row["type"] == "comment":
			title = "Comment by " + row["author"]
		else:
			title = feed_name

		link = "/feeds/" + fingerprint + "/-/" + item_fp

		a.print('<item>\n')
		a.print('<title>' + escape_xml(title) + '</title>\n')
		a.print('<link>' + escape_xml(link) + '</link>\n')
		a.print('<description>' + escape_xml(body) + '</description>\n')
		a.print('<pubDate>' + mochi.time.local(row["created"], "rfc822") + '</pubDate>\n')
		a.print('<guid isPermaLink="false">' + escape_xml(item_id) + '</guid>\n')
		a.print('</item>\n')

	a.print('</channel>\n')
	a.print('</rss>')
