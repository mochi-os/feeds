# Mochi Feeds app
# Copyright Alistair Cunningham 2024-2025

# Helper: Get feed from request input, validating it exists
def get_feed(a):
    feed = a.input("feed")
    if not feed:
        return None
    row = mochi.db.row("select * from feeds where id=?", feed)
    if not row:
        row = mochi.db.row("select * from feeds where fingerprint=?", feed)
    return row

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

# Helper: Broadcast WebSocket notification to all subscribers of a feed
# This writes to each subscriber's WebSocket connection so they get real-time updates
# Optional: notification_info dict with {"feed_name": "...", "post_excerpt": "..."} to create notifications
def broadcast_websocket(feed_id, data, notification_info=None):
    if not feed_id:
        return
    
    # Get the feed fingerprint for WebSocket key matching
    # Frontend may connect with fingerprint (from URL) or entity ID
    fingerprint = mochi.entity.fingerprint(feed_id)
    
    # Write to owner's WebSocket using BOTH keys (entity ID and fingerprint)
    # This ensures the message is received regardless of which key frontend uses
    mochi.log.info("broadcast_websocket: writing to WebSocket keys: entity=%s fingerprint=%s", feed_id, fingerprint)
    mochi.websocket.write(feed_id, data)
    if fingerprint:
        mochi.websocket.write(fingerprint, data)
    
    # Also send P2P message to notify subscribers to refresh
    # Use "post/create" event with websocket_trigger to use existing registered handler
    subscribers = mochi.db.rows("select id from subscribers where feed=?", feed_id)
    mochi.log.info("broadcast_websocket: sending websocket notification to %d subscribers", len(subscribers))
    for sub in subscribers:
        mochi.log.info("broadcast_websocket: sending to subscriber %s", sub["id"])
        # Include websocket_data and notification_info so subscriber's handler can create notification
        msg_content = {"id": "", "created": 0, "body": "", "websocket_trigger": True, "websocket_data": data, "fingerprint": fingerprint}
        if notification_info:
            msg_content["notification_info"] = notification_info
        mochi.message.send(
            {"from": feed_id, "to": sub["id"], "service": "feeds", "event": "post/create"},
            msg_content
        )

def feed_by_id(user_id, feed_id):
	feeds = mochi.db.rows("select * from feeds where id=?", feed_id)
	if len(feeds) == 0:
		feeds = mochi.db.rows("select * from feeds where fingerprint=?", feed_id)
		if len(feeds) == 0:
			return None
	
	feed_data = feeds[0]

	if user_id != None:
		feed_data["entity"] = mochi.entity.get(feed_data.get("id"))

	return feed_data

def feed_comments(user_id, post_data, parent_id, depth):
	if (depth > 1000):
		return None

	if parent_id == None:
		parent_id = ""

	comments = mochi.db.rows("select * from comments where post=? and parent=? order by created desc", post_data["id"], parent_id)
	for i in range(len(comments)):
		comments[i]["feed_fingerprint"] = mochi.entity.fingerprint(comments[i]["feed"])
		comments[i]["body_markdown"] = mochi.markdown.render(comments[i]["body"])
		comments[i]["created_string"] = mochi.time.local(comments[i]["created"])
		comments[i]["user"] = user_id or ""

		my_reaction = mochi.db.row("select reaction from reactions where comment=? and subscriber=?", comments[i]["id"], user_id)
		if my_reaction:
			comments[i]["my_reaction"] = my_reaction["reaction"]
		else:
			comments[i]["my_reaction"] = ""

		comments[i]["reactions"] = mochi.db.rows("select * from reactions where comment=? and subscriber!=? and reaction!='' order by name", comments[i]["id"], user_id)

		comments[i]["children"] = feed_comments(user_id, post_data, comments[i]["id"], depth + 1)

	return comments 

def is_reaction_valid(reaction):
	# "none" means remove reaction
	if reaction == "none":
		return {"valid": True, "reaction": ""}
	if mochi.valid(reaction, "^(like|dislike|laugh|amazed|love|sad|angry|agree|disagree)$"):
		return {"valid": True, "reaction": reaction}
	return {"valid": False, "reaction": ""}

def feed_update(user_id, feed_data):
	feed_id = feed_data["id"]
	# Use atomic subquery to avoid race condition
	mochi.db.execute("update feeds set subscribers=(select count(*) from subscribers where feed=?), updated=? where id=?", feed_id, mochi.time.now(), feed_id)

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
def send_recent_posts(user_id, feed_data, subscriber_id):
	feed_id = feed_data["id"]
	feed_posts = mochi.db.rows("select * from posts where feed=? order by created desc limit 1000", feed_data["id"])

	for post in feed_posts:
		mochi.message.send(headers(feed_id, subscriber_id, "post/create"), post)
		# Sync existing attachments to new subscriber
		mochi.attachment.sync(post["id"], [subscriber_id])

		comments = mochi.db.rows("select * from comments where post=? order by created", post["id"])
		for c in comments:
			mochi.message.send(headers(feed_id, subscriber_id, "comment/create"), c)

			reactions = mochi.db.rows("select * from reactions where comment=?", c["id"])
			for r in reactions:
				mochi.message.send(
					headers(feed_id, subscriber_id, "comment/react"),
					{"feed": feed_id, "post": post["id"], "comment": c["id"], "subscriber": r["subscriber"], "name": r["name"], "reaction": r["reaction"]}
				)

		reactions = mochi.db.rows("select * from reactions where post=? and comment=''", post["id"])
		for r in reactions:
			mochi.message.send(
				headers(feed_id, subscriber_id, "post/react"),
				{"feed": feed_id, "post": post["id"], "subscriber": r["subscriber"], "name": r["name"], "reaction": r["reaction"]}
			)

def is_feed_owner(user_id, feed_data):
	if feed_data == None:
		return False
	id = feed_data.get("id")
	if not id:
		return False
	if mochi.entity.get(id):
		return True
	return False

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
	set_post_updated(post_data["id"])
	set_feed_updated(post_data["feed"])

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
	mochi.db.execute("create table if not exists settings ( name text not null primary key, value text not null )")
	mochi.db.execute("replace into settings ( name, value ) values ( 'schema', 4 )")

	mochi.db.execute("create table if not exists feeds ( id text not null primary key, fingerprint text not null, name text not null, privacy text not null default 'public', owner integer not null default 0, subscribers integer not null default 0, updated integer not null, server text not null default '' )")
	mochi.db.execute("create index if not exists feeds_fingerprint on feeds( fingerprint )")
	mochi.db.execute("create index if not exists feeds_name on feeds( name )")
	mochi.db.execute("create index if not exists feeds_updated on feeds( updated )")

	mochi.db.execute("create table if not exists subscribers ( feed references feeds( id ), id text not null, name text not null default '', primary key ( feed, id ) )")
	mochi.db.execute("create index if not exists subscriber_id on subscribers( id )")

	mochi.db.execute("create table if not exists posts ( id text not null primary key, feed references feeds( id ), body text not null, data text not null default '', created integer not null, updated integer not null, edited integer not null default 0 )")
	mochi.db.execute("create index if not exists posts_feed on posts( feed )")
	mochi.db.execute("create index if not exists posts_created on posts( created )")
	mochi.db.execute("create index if not exists posts_updated on posts( updated )")

	mochi.db.execute("create table if not exists comments ( id text not null primary key, feed references feeds( id ), post references posts( id ), parent text not null, subscriber text not null, name text not null, body text not null, created integer not null, edited integer not null default 0 )")
	mochi.db.execute("create index if not exists comments_feed on comments( feed )")
	mochi.db.execute("create index if not exists comments_post on comments( post )")
	mochi.db.execute("create index if not exists comments_parent on comments( parent )")
	mochi.db.execute("create index if not exists comments_created on comments( created )")

	mochi.db.execute("create table if not exists reactions ( feed references feeds( id ), post references posts( id ), comment text not null default '', subscriber text not null, name text not null, reaction text not null default '', primary key ( feed, post, comment, subscriber ) )")
	mochi.db.execute("create index if not exists reactions_post on reactions( post )")
	mochi.db.execute("create index if not exists reactions_comment on reactions( comment )")

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

# ACTIONS

# Info endpoint for class context - returns list of feeds
def action_info_class(a):
    feeds = mochi.db.rows("select * from feeds order by updated desc")
    return {"data": {"entity": False, "feeds": feeds}}

# Info endpoint for entity context - returns feed info with permissions
def action_info_entity(a):
    feed = get_feed(a)
    if not feed:
        a.error(404, "Feed not found")
        return

    if not check_access(a, feed["id"], "view"):
        a.error(403, "Access denied")
        return

    # Determine permissions for current user
    can_manage = check_access(a, feed["id"], "manage") if a.user else False
    permissions = {
        "view": True,
        "react": can_manage or check_access(a, feed["id"], "react") or check_access(a, feed["id"], "comment"),
        "comment": can_manage or check_access(a, feed["id"], "comment"),
        "manage": can_manage,
    } if a.user else {"view": True, "react": False, "comment": False, "manage": False}

    fp = mochi.entity.fingerprint(feed["id"], True)
    return {"data": {
        "entity": True,
        "feed": feed,
        "permissions": permissions,
        "fingerprint": fp
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
	# Note: Subscribed feeds (owner=0) must fetch from owner since P2P sync doesn't work reliably
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
	limit = 20
	if limit_str and mochi.valid(limit_str, "natural"):
		limit = min(int(limit_str), 100)
	before = None
	if before_str and mochi.valid(before_str, "natural"):
		before = int(before_str)

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
			posts = mochi.db.rows("select * from posts where feed=? and created<? order by created desc limit ?", feed_data["id"], before, limit + 1)
		else:
			posts = mochi.db.rows("select * from posts where feed=? order by created desc limit ?", feed_data["id"], limit + 1)
	else:
		# Only show posts from feeds the user is subscribed to or owns
		if before:
			posts = mochi.db.rows("select p.* from posts p inner join subscribers s on p.feed = s.feed where s.id = ? and p.created<? order by p.created desc limit ?", user_id, before, limit + 1)
		else:
			posts = mochi.db.rows("select p.* from posts p inner join subscribers s on p.feed = s.feed where s.id = ? order by p.created desc limit ?", user_id, limit + 1)

	# Check if there are more posts (we fetched limit+1)
	has_more = len(posts) > limit
	if has_more:
		posts = posts[:limit]

	for i in range(len(posts)):
		fd = mochi.db.row("select name from feeds where id=?", posts[i]["feed"])
		if fd:
			posts[i]["feed_fingerprint"] = mochi.entity.fingerprint(posts[i]["feed"])
			posts[i]["feed_name"] = fd["name"]

		posts[i]["body_markdown"] = mochi.markdown.render(posts[i]["body"])
		posts[i]["created_string"] = mochi.time.local(posts[i]["created"])
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

	is_owner = is_feed_owner(user_id, feed_data)
	feeds = mochi.db.rows("select * from feeds order by updated desc")

	next_cursor = None
	if has_more and len(posts) > 0:
		next_cursor = posts[-1]["created"]

	# Determine permissions for current user
	permissions = None
	if feed_data and user_id:
		can_manage = check_access(a, feed_data["id"], "manage") or is_owner
		is_public = feed_data.get("privacy", "public") == "public"
		is_subscriber = mochi.db.exists("select 1 from subscribers where feed=? and id=?", feed_data["id"], user_id)
		
		# Subscribers and public feed viewers can react/comment
		can_react = can_manage or check_access(a, feed_data["id"], "react") or is_subscriber or is_public
		can_comment = can_manage or check_access(a, feed_data["id"], "comment") or is_subscriber or is_public
		
		permissions = {
			"view": True,
			"react": can_react,
			"comment": can_comment,
			"manage": can_manage,
		}

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
def view_remote(a, user_id, feed_id, server, local_feed):
	if not user_id:
		a.error(401, "Not logged in")
		return

	# Resolve server URL to peer, or use directory lookup if no server
	peer = None
	if server:
		peer = mochi.remote.peer(server)
		if not peer:
			a.error(502, "Unable to connect to server")
			return
	# If no peer, mochi.remote.request will use directory lookup
	response = mochi.remote.request(feed_id, "feeds", "view", {"feed": feed_id}, peer)
	if response.get("error"):
		a.error(response.get("code", 500), response["error"])
		return

	feed_name = response.get("name", "")

	# Add local user's reactions to remote posts
	# (reactions are stored locally, not on the remote server)
	posts = response.get("posts", [])
	for i in range(len(posts)):
		my_reaction = mochi.db.row("select reaction from reactions where post=? and subscriber=? and comment=?", posts[i]["id"], user_id, "")
		posts[i]["my_reaction"] = my_reaction["reaction"] if my_reaction else ""
		# Also look up local reactions for comments
		if posts[i].get("comments"):
			for j in range(len(posts[i]["comments"])):
				comment_reaction = mochi.db.row("select reaction from reactions where comment=? and subscriber=?", posts[i]["comments"][j]["id"], user_id)
				posts[i]["comments"][j]["my_reaction"] = comment_reaction["reaction"] if comment_reaction else ""

	# Return in same format as local view
	return {
		"data": {
			"feed": {
				"id": feed_id,
				"name": feed_name,
				"fingerprint": response.get("fingerprint", mochi.entity.fingerprint(feed_id)),
				"privacy": response.get("privacy", "public"),
				"owner": 0,
				"subscribers": 0
			},
			"posts": posts,
			"feeds": mochi.db.rows("select * from feeds order by updated desc"),
			"owner": False,
			"user": user_id,
			"hasMore": False,
			"nextCursor": None,
			"permissions": response.get("permissions")
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

    fp = mochi.entity.fingerprint(entity)
    now = mochi.time.now()
    creator = a.user.identity.id

    # Store in database
    mochi.db.execute("insert into feeds (id, fingerprint, name, privacy, owner, subscribers, updated) values (?, ?, ?, ?, 1, 1, ?)",
        entity, fp, name, privacy, now)
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

    return {"data": {"id": entity, "fingerprint": fp}}

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
	
	return {
		"data": {
			"feeds": feeds,
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

    # Save any uploaded attachments and notify subscribers via _attachment/create events
    attachments = mochi.attachment.save(post_uid, "files", [], [], subscribers)

    # Send post to subscribers (attachments sent separately via federation)
    post_event = {"id": post_uid, "created": now, "body": body}
    if data:
        post_event["data"] = data
    broadcast_event(feed_id, "post/create", post_event, user_id)

    # Send WebSocket notification for real-time UI updates (to owner and all subscribers)
    # Include notification info so subscribers get a notification
    feed_name = feed.get("name", "Feed")
    post_excerpt = body[:50] + "..." if len(body) > 50 else body
    notification_info = {"feed_name": feed_name, "post_excerpt": post_excerpt, "post_id": post_uid}
    broadcast_websocket(feed_id, {"type": "post/create", "feed": feed_id, "post": post_uid}, notification_info)


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
		new_attachments = mochi.attachment.save(post_id, "files", [], [], subscribers)

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
					mochi.attachment.delete(att["id"], subscribers)

			# Reorder all attachments according to final order (positions start at 1)
			for i, att_id in enumerate(final_order):
				mochi.attachment.move(att_id, i + 1, subscribers)

		edit_event = {"post": post_id, "body": body, "edited": now}
		if data:
			edit_event["data"] = data
		broadcast_event(info["id"], "post/edit", edit_event, user_id)

		# Send WebSocket notification for real-time UI updates (to owner and all subscribers)
		broadcast_websocket(info["id"], {"type": "post/edit", "feed": info["id"], "post": post_id})

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
		mochi.attachment.clear(post_id, subscribers)
		mochi.db.execute("delete from posts where id=?", post_id)

		broadcast_event(info["id"], "post/delete", {"post": post_id}, user_id)

		# Send WebSocket notification for real-time UI updates (to owner and all subscribers)
		broadcast_websocket(info["id"], {"type": "post/delete", "feed": info["id"], "post": post_id})

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
		feed_fingerprint = response.get("fingerprint", "")
	else:
		# Use directory lookup when no server specified
		directory = mochi.directory.get(feed_id)
		if directory == None or len(directory) == 0:
			a.error(404, "Unable to find feed in directory")
			return
		feed_name = directory["name"]
		feed_fingerprint = mochi.entity.fingerprint(feed_id)

	mochi.db.execute("replace into feeds ( id, fingerprint, name, owner, subscribers, updated, server ) values ( ?, ?, ?, 0, 1, ?, ? )", feed_id, feed_fingerprint, feed_name, mochi.time.now(), server or "")
	mochi.db.execute("replace into subscribers ( feed, id, name ) values ( ?, ?, ? )", feed_id, user_id, a.user.identity.name)

	mochi.message.send(headers(user_id, feed_id, "subscribe"), {"name": a.user.identity.name})

	return {
		"data": {"fingerprint": feed_fingerprint}
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

# Unified attachment view - handles both local and remote feeds
def action_attachment_view(a):
	user_id = a.user.identity.id if a.user and a.user.identity else None

	feed_id = a.input("feed")
	attachment_id = a.input("attachment")

	if not attachment_id:
		a.error(400, "Missing attachment")
		return

	# Get local feed data if available
	feed = None
	if feed_id and (mochi.valid(feed_id, "entity") or mochi.valid(feed_id, "fingerprint")):
		feed = feed_by_id(user_id, feed_id)

	# If feed is local and we own it, serve directly
	if feed and feed.get("owner") == 1:
		# Check access - public feeds or authorized users
		is_public = feed.get("privacy", "public") == "public"
		if not is_public and not user_id:
			a.error(401, "Not logged in")
			return
		if not is_public and not check_access(a, feed["id"], "view"):
			a.error(403, "Access denied")
			return

		# Find the attachment by searching through posts in this feed
		posts = mochi.db.rows("select id from posts where feed=?", feed["id"])
		found = None
		for post in posts:
			attachments = mochi.attachment.list(post["id"])
			for att in attachments:
				if att.get("id") == attachment_id:
					found = att
					break
			if found:
				break

		if not found:
			a.error(404, "Attachment not found")
			return

		# Get attachment file path and serve directly
		path = mochi.attachment.path(attachment_id)
		if not path:
			a.error(404, "Attachment file not found")
			return

		a.write_from_file(path)
		return

	# Remote feed - stream via P2P
	if not user_id:
		a.error(401, "Not logged in")
		return

	if not mochi.valid(feed_id, "entity") and not mochi.valid(feed_id, "fingerprint"):
		a.error(400, "Invalid feed ID")
		return

	# Create stream to feed owner and request attachment
	s = mochi.remote.stream(feed_id, "feeds", "attachment/view", {"attachment": attachment_id})
	if not s:
		a.error(502, "Unable to connect to feed")
		return

	# Read status response
	response = s.read()
	if not response or response.get("status") != "200":
		s.close()
		error = response.get("error", "Attachment not found") if response else "No response"
		a.error(404, error)
		return

	# Set Content-Type header before streaming
	content_type = response.get("content_type", "application/octet-stream")
	a.header("Content-Type", content_type)

	# Stream file directly to HTTP response (no temp file needed)
	a.write_from_stream(s)
	s.close()

# Unified thumbnail view - handles both local and remote feeds
def action_attachment_thumbnail(a):
	user_id = a.user.identity.id if a.user and a.user.identity else None

	feed_id = a.input("feed")
	attachment_id = a.input("attachment")

	if not attachment_id:
		a.error(400, "Missing attachment")
		return

	# Get local feed data if available
	feed = None
	if feed_id and (mochi.valid(feed_id, "entity") or mochi.valid(feed_id, "fingerprint")):
		feed = feed_by_id(user_id, feed_id)

	# If feed is local and we own it, serve thumbnail directly
	if feed and feed.get("owner") == 1:
		# Check access - public feeds or authorized users
		is_public = feed.get("privacy", "public") == "public"
		if not is_public and not user_id:
			a.error(401, "Not logged in")
			return
		if not is_public and not check_access(a, feed["id"], "view"):
			a.error(403, "Access denied")
			return

		# Get thumbnail path (creates thumbnail if needed)
		path = mochi.attachment.thumbnail_path(attachment_id)
		if not path:
			# Fall back to original if no thumbnail available
			path = mochi.attachment.path(attachment_id)
		if not path:
			a.error(404, "Attachment not found")
			return

		a.write_from_file(path)
		return

	# Remote feed - stream via P2P (request thumbnail)
	if not user_id:
		a.error(401, "Not logged in")
		return

	if not mochi.valid(feed_id, "entity") and not mochi.valid(feed_id, "fingerprint"):
		a.error(400, "Invalid feed ID")
		return

	# Create stream to feed owner and request thumbnail
	s = mochi.remote.stream(feed_id, "feeds", "attachment/view", {"attachment": attachment_id, "thumbnail": True})
	if not s:
		a.error(502, "Unable to connect to feed")
		return

	# Read status response
	response = s.read()
	if not response or response.get("status") != "200":
		s.close()
		error = response.get("error", "Thumbnail not found") if response else "No response"
		a.error(404, error)
		return

	# Set Content-Type header before streaming
	content_type = response.get("content_type", "image/jpeg")
	a.header("Content-Type", content_type)

	# Stream file directly to HTTP response (no temp file needed)
	a.write_from_stream(s)
	s.close()

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

    # If feed exists locally (owned or subscribed), handle locally
    if feed:
        feed_id = feed["id"]
        is_owner = feed.get("owner") == 1

        # Allow comments on public feeds, otherwise check access control (only for owned feeds)
        is_public = feed.get("privacy", "public") == "public"
        if is_owner and not is_public and not check_access(a, feed_id, "comment"):
            a.error(403, "Access denied")
            return

        if not mochi.db.exists("select id from posts where id=? and feed=?", post_id, feed_id):
            a.error(404, "Post not found")
            return

        if parent_id != "" and not mochi.db.exists("select id from comments where id=? and post=?", parent_id, post_id):
            a.error(404, "Parent not found")
            return

        uid = mochi.uid()
        if mochi.db.exists("select id from comments where id=?", uid):
            a.error(500, "Duplicate ID")
            return

        now = mochi.time.now()
        mochi.db.execute("insert into comments (id, feed, post, parent, subscriber, name, body, created) values (?, ?, ?, ?, ?, ?, ?, ?)",
            uid, feed_id, post_id, parent_id, user_id, a.user.identity.name, body, now)
        set_post_updated(post_id)
        set_feed_updated(feed_id)

        # If we're the feed owner, broadcast to subscribers; otherwise send to owner for approval
        if is_feed_owner(user_id, feed):
            broadcast_event(feed_id, "comment/create",
                {"id": uid, "post": post_id, "parent": parent_id, "created": now,
                 "subscriber": user_id, "name": a.user.identity.name, "body": body}, user_id)

            # Send WebSocket notification for real-time UI updates (to owner and all subscribers)
            broadcast_websocket(feed_id, {"type": "comment/create", "feed": feed_id, "post": post_id, "comment": uid})
        else:
            # Subscriber commenting - send to feed owner and also trigger local WebSocket
            mochi.message.send(
                headers(user_id, feed_id, "comment/submit"),
                {"id": uid, "post": post_id, "parent": parent_id, "body": body, "name": a.user.identity.name}
            )
            # WebSocket for local real-time update (subscriber sees their own comment immediately)
            broadcast_websocket(feed_id, {"type": "comment/create", "feed": feed_id, "post": post_id, "comment": uid})

        return {"data": {"id": uid, "feed": feed, "post": post_id}}

    # Remote feed (not in local database) - forward via P2P
    if not mochi.valid(feed_id, "entity") and not mochi.valid(feed_id, "fingerprint"):
        a.error(400, "Invalid feed ID")
        return

    if not mochi.valid(post_id, "id"):
        a.error(400, "Invalid post ID")
        return

    # Send comment to feed owner
    response = mochi.remote.request(feed_id, "feeds", "comment/add", {
        "feed": feed_id, "post": post_id, "parent": parent_id, "body": body, "name": a.user.identity.name
    })
    if response.get("error"):
        a.error(response.get("code", 500), response["error"])
        return

    return {"data": {"id": response.get("id"), "feed": feed_id, "post": post_id}}

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
		broadcast_websocket(info["id"], {"type": "comment/edit", "feed": info["id"], "post": row["post"], "comment": comment_id})

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
		broadcast_websocket(info["id"], {"type": "comment/delete", "feed": info["id"], "post": post_id, "comment": comment_id})

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
	mochi.db.execute("delete from reactions where comment=?", comment_id)
	mochi.db.execute("delete from comments where id=?", comment_id)

def action_post_react(a):
    if not a.user:
        a.error(401, "Not logged in")
        return
    user_id = a.user.identity.id

    feed_id = a.input("feed")
    post_id = a.input("post")

    result = is_reaction_valid(a.input("reaction"))
    if not result["valid"]:
        a.error(400, "Invalid reaction")
        return
    reaction = result["reaction"]

    # Get local feed data if available
    feed = None
    if feed_id and (mochi.valid(feed_id, "entity") or mochi.valid(feed_id, "fingerprint")):
        feed = feed_by_id(user_id, feed_id)

    # If feed exists locally (owned or subscribed), handle reaction locally
    if feed:
        feed_id = feed["id"]
        is_owner = feed.get("owner") == 1

        post_data = mochi.db.row("select * from posts where id=? and feed=?", post_id, feed_id)
        if not post_data:
            a.error(404, "Post not found")
            return

        # Reactions require react permission (for owned feeds) or subscriber status
        if is_owner and not check_access(a, feed_id, "react"):
            a.error(403, "Access denied")
            return

        post_reaction_set(post_data, user_id, a.user.identity.name, reaction)

        # If we're the feed owner, broadcast to subscribers; otherwise send to owner
        if is_feed_owner(user_id, feed):
            broadcast_event(feed_id, "post/react",
                {"feed": feed_id, "post": post_id, "subscriber": user_id,
                 "name": a.user.identity.name, "reaction": reaction}, user_id)
        else:
            mochi.message.send(
                headers(user_id, feed_id, "post/react/submit"),
                {"post": post_id, "name": a.user.identity.name, "reaction": reaction}
            )

        # Send WebSocket notification for real-time UI updates (to owner and all subscribers)
        broadcast_websocket(feed_id, {"type": "react/post", "feed": feed_id, "post": post_id})

        return {"data": {"feed": feed, "id": post_id, "reaction": reaction}}

    # Remote feed (not in local database) - forward via P2P
    if not mochi.valid(feed_id, "entity") and not mochi.valid(feed_id, "fingerprint"):
        a.error(400, "Invalid feed ID")
        return

    if not mochi.valid(post_id, "id"):
        a.error(400, "Invalid post ID")
        return

    # Send reaction to feed owner
    # Send "none" for removal since is_reaction_valid only accepts "none", not empty string
    response = mochi.remote.request(feed_id, "feeds", "post/react/add", {
        "feed": feed_id, "post": post_id, "reaction": reaction if reaction else "none", "name": a.user.identity.name
    })
    if response.get("error"):
        a.error(response.get("code", 500), response["error"])
        return

    # Save reaction locally so it's available when viewing remote feed posts
    # (reactions to subscribed feeds are stored locally, not on the remote server)
    if reaction:
        mochi.db.execute("replace into reactions ( feed, post, subscriber, name, reaction ) values ( ?, ?, ?, ?, ? )",
            feed_id, post_id, user_id, a.user.identity.name, reaction)
    else:
        mochi.db.execute("delete from reactions where feed=? and post=? and comment='' and subscriber=?",
            feed_id, post_id, user_id)


    return {"data": {"feed": feed_id, "post": post_id, "reaction": reaction}}

def action_comment_react(a):
    if not a.user:
        a.error(401, "Not logged in")
        return
    user_id = a.user.identity.id

    feed_id = a.input("feed")
    comment_id = a.input("comment")

    result = is_reaction_valid(a.input("reaction"))
    if not result["valid"]:
        a.error(400, "Invalid reaction")
        return
    reaction = result["reaction"]

    # Get local feed data if available
    feed = None
    if feed_id and (mochi.valid(feed_id, "entity") or mochi.valid(feed_id, "fingerprint")):
        feed = feed_by_id(user_id, feed_id)

    # If feed exists locally (owned or subscribed), handle reaction locally
    if feed:
        feed_id = feed["id"]
        is_owner = feed.get("owner") == 1

        comment_data = mochi.db.row("select * from comments where id=? and feed=?", comment_id, feed_id)
        if not comment_data:
            a.error(404, "Comment not found")
            return

        # Reactions require react permission (for owned feeds) or subscriber status
        if is_owner and not check_access(a, feed_id, "react"):
            a.error(403, "Access denied")
            return

        comment_reaction_set(comment_data, user_id, a.user.identity.name, reaction)

        # If we're the feed owner, broadcast to subscribers; otherwise send to owner
        if is_feed_owner(user_id, feed):
            broadcast_event(feed_id, "comment/react",
                {"feed": feed_id, "post": comment_data["post"], "comment": comment_id,
                 "subscriber": user_id, "name": a.user.identity.name, "reaction": reaction}, user_id)
        else:
            mochi.message.send(
                headers(user_id, feed_id, "comment/react/submit"),
                {"comment": comment_id, "name": a.user.identity.name, "reaction": reaction}
            )

        # Send WebSocket notification for real-time UI updates (to owner and all subscribers)
        broadcast_websocket(feed_id, {"type": "react/comment", "feed": feed_id, "post": comment_data["post"], "comment": comment_id})

        return {"data": {"feed": feed, "post": comment_data["post"], "comment": comment_id, "reaction": reaction}}

    # Remote feed (not in local database) - forward via P2P
    if not mochi.valid(feed_id, "entity") and not mochi.valid(feed_id, "fingerprint"):
        a.error(400, "Invalid feed ID")
        return

    if not mochi.valid(comment_id, "id"):
        a.error(400, "Invalid comment ID")
        return

    # Send reaction to feed owner
    # Send "none" for removal since is_reaction_valid only accepts "none", not empty string
    response = mochi.remote.request(feed_id, "feeds", "comment/react/add", {
        "feed": feed_id, "comment": comment_id, "reaction": reaction if reaction else "none", "name": a.user.identity.name
    })
    if response.get("error"):
        a.error(response.get("code", 500), response["error"])
        return

    # Save reaction locally so it's available when viewing remote feed posts
    # (reactions to subscribed feeds are stored locally, not on the remote server)
    # Note: We store with empty post since we only have the comment_id
    if reaction:
        mochi.db.execute("replace into reactions ( feed, post, comment, subscriber, name, reaction ) values ( ?, ?, ?, ?, ?, ? )",
            feed_id, "", comment_id, user_id, a.user.identity.name, reaction)
    else:
        mochi.db.execute("delete from reactions where feed=? and comment=? and subscriber=?",
            feed_id, comment_id, user_id)

    return {"data": {"feed": feed_id, "comment": comment_id, "reaction": reaction}}

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
    if mochi.entity.get(feed["id"]):
        # Current user is the owner
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

	if not mochi.valid(comment["id"], "id"):
		mochi.log.info("Feed dropping comment with invalid ID '%s'", comment["id"])
		return

	if mochi.db.exists("select id from comments where id=?", comment["id"]):
		mochi.log.info("Feed dropping comment with duplicate ID '%s'", comment["id"])
		return

	if not mochi.valid(comment["subscriber"], "entity"):
		mochi.log.info("Feed dropping comment with invalid subscriber '%s'", comment["subscriber"])
		return

	if not mochi.valid(comment["name"], "name"):
		mochi.log.info("Feed dropping comment with invalid name '%s'", comment["name"])
		return

	if not mochi.valid(comment["body"], "text"):
		mochi.log.info("Feed dropping comment with invalid body '%s'", comment["body"])
		return

	mochi.db.execute("replace into comments ( id, feed, post, parent, subscriber, name, body, created ) values ( ?, ?, ?, ?, ?, ?, ?, ? )", comment["id"], feed_id, comment["post"], comment["parent"], comment["subscriber"], comment["name"], comment["body"], comment["created"])
	set_post_updated(comment["post"], comment["created"])
	set_feed_updated(feed_id, comment["created"])

def event_comment_submit(e): # feeds_comment_submit_event
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("to"))
	if not feed_data:
		mochi.log.info("Feed dropping post to unknown feed")
		return
	feed_id = feed_data["id"]
	
	comment = {"id": e.content("id"), "post": e.content("post"), "parent": e.content("parent"), "body": e.content("body")}

	if not mochi.valid(comment["id"], "id"):
		mochi.log.info("Feed dropping comment with invalid ID '%s'", comment["id"])
		return

	if mochi.db.exists("select id from comments where id=?", comment["id"]):
		mochi.log.info("Feed dropping comment with duplicate ID '%s'", comment["id"])
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
	set_post_updated(comment["post"])
	set_feed_updated(feed_id)
	
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

	if not mochi.valid(comment_id, "id"):
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

	if not mochi.valid(comment_id, "id"):
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
	
	comment_data = mochi.db.row("select * from comments where id=?", e.content("comment"))
	if not comment_data:
		mochi.log.info("Feed dropping comment reaction for unknown comment")
		return
	comment_id = comment_data["id"]

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
	comment_reaction_set(comment_data, e.content("subscriber"), e.content("name"), reaction)

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
	name = e.content("name")
	
	if not mochi.valid(name, "name"):
		mochi.log.info("Feed dropping comment reaction submit with invalid name")
		return

	# Verify comment exists
	comment_data = mochi.db.row("select * from comments where id=? and feed=?", comment_id, feed_id)
	if not comment_data:
		mochi.log.info("Feed dropping comment reaction submit for unknown comment '%s'", comment_id)
		return

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

	# Broadcast to all other subscribers
	subs = mochi.db.rows("select * from subscribers where feed=?", feed_id)
	for s in subs:
		if s["id"] == sender_id or s["id"] == user_id:
			continue
		mochi.message.send(
			headers(feed_id, s["id"], "comment/react"),
			{"feed": feed_id, "post": comment_data["post"], "comment": comment_id, "subscriber": sender_id, "name": name, "reaction": reaction}
		)

def event_post_create(e): # feeds_post_create_event
	user_id = e.user.identity.id
	mochi.log.info("event_post_create: received from %s, websocket_trigger=%s, post_id=%s", e.header("from"), e.content("websocket_trigger"), e.content("id"))
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		mochi.log.info("Feed dropping post to unknown feed")
		return


	# Check if this is a WebSocket trigger message (not an actual post sync)
	if e.content("websocket_trigger"):
		mochi.log.info("Feed event_post_create: websocket_trigger received for feed %s", feed_data["id"])
		ws_data = e.content("websocket_data")
		fingerprint = e.content("fingerprint")
		notification_info = e.content("notification_info")
		
		# Trigger WebSocket for real-time UI updates
		if ws_data:
			# Write to both entity ID and fingerprint keys
			mochi.log.info("Feed event_post_create: triggering WebSocket with data %s (fingerprint=%s)", ws_data, fingerprint)
			mochi.websocket.write(feed_data["id"], ws_data)
			if fingerprint:
				mochi.websocket.write(fingerprint, ws_data)
		
		# Create notification for subscriber about new post
		if notification_info:
			feed_name = notification_info.get("feed_name", "Feed")
			post_excerpt = notification_info.get("post_excerpt", "New post")
			post_id = notification_info.get("post_id", "")
			fp = fingerprint if fingerprint else feed_data.get("fingerprint", "")
			mochi.log.info("Feed event_post_create: creating notification for feed %s", feed_name)
			mochi.service.call("notifications", "create",
				"feeds",        # App name
				"post",         # Category
				post_id,        # Object ID (post)
				"New post in " + feed_name + ": " + post_excerpt,
				"/feeds/" + fp
			)
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
	# Attachments arrive via _attachment/create events and are saved automatically

	set_feed_updated(feed_data["id"])

	# Send WebSocket notification for real-time UI updates
	fingerprint = feed_data.get("fingerprint", "")
	mochi.websocket.write(feed_data["id"], {"type": "post/create", "feed": feed_data["id"], "post": post["id"]})
	if fingerprint:
		mochi.websocket.write(fingerprint, {"type": "post/create", "feed": feed_data["id"], "post": post["id"]})

	# Create notification for subscriber about new post
	feed_name = feed_data.get("name", "Feed")
	post_excerpt = post["body"][:50] + "..." if len(post["body"]) > 50 else post["body"]
	mochi.service.call("notifications", "create",
		"feeds",        # App name
		"post",         # Category
		post["id"],     # Object ID (post)
		"New post in " + feed_name + ": " + post_excerpt,
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
	set_feed_updated(feed_data["id"])

	# Send WebSocket notification for real-time UI updates
	mochi.websocket.write(feed_data["id"], {"type": "post/edit", "feed": feed_data["id"], "post": post_id})

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
	mochi.websocket.write(feed_data["id"], {"type": "post/delete", "feed": feed_data["id"], "post": post_id})

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
	post_reaction_set(post_data, e.content("subscriber"), e.content("name"), reaction)

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

def event_subscribe(e): # feeds_subscribe_event
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("to"))
	if not feed_data:
		return

	name = e.content("name")
	if not mochi.valid(name, "line"):
		return

	mochi.db.execute("insert or ignore into subscribers ( feed, id, name ) values ( ?, ?, ? )", feed_data["id"], e.header("from"), name)
	mochi.db.execute("update feeds set subscribers=(select count(*) from subscribers where feed=?), updated=? where id=?", feed_data["id"], mochi.time.now(), feed_data["id"])

	feed_update(user_id, feed_data)
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
	user_id = e.user.identity.id if e.user and e.user.identity else None
	feed_data = feed_by_id(user_id, e.content("feed"))
	if not feed_data:
		return

	subscribers = e.content("subscribers", "0")
	if not mochi.valid(subscribers, "natural"):
		mochi.log.info("Feed dropping update with invalid number of subscribers '%s'", subscribers)
		return

	mochi.db.execute("update feeds set subscribers=?, updated=? where id=?", subscribers, mochi.time.now(), feed_data["id"])

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

	# Get posts for this feed
	posts = mochi.db.rows("select * from posts where feed=? order by created desc limit 100", feed_id)

	# Format posts with comments and reactions
	formatted_posts = []
	for post in posts:
		post_data = dict(post)
		post_data["feed_fingerprint"] = feed_fingerprint
		post_data["feed_name"] = feed_name
		post_data["body_markdown"] = mochi.markdown.render(post["body"])
		post_data["created_string"] = mochi.time.local(post["created"])
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

	# Read request data from stream (sent by action after opening)
	request = e.stream.read()
	if not request:
		e.stream.write({"status": "400", "error": "No request data"})
		return
	attachment = request.get("attachment", "")

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
	want_thumbnail = request.get("thumbnail", False)

	# Get attachment file path
	if want_thumbnail:
		path = mochi.attachment.thumbnail_path(attachment)
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
		e.stream.write({"error": "Feed not found"})
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
	if parent_id and not mochi.db.exists("select id from comments where id=? and post=?", parent_id, post_id):
		e.stream.write({"error": "Parent comment not found"})
		return

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

	# Broadcast to subscribers
	broadcast_event(feed_id, "comment/create",
		{"id": uid, "post": post_id, "parent": parent_id, "created": now,
		 "subscriber": commenter_id, "name": name, "body": body}, commenter_id)

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

	# Broadcast to subscribers
	broadcast_event(feed_id, "post/react",
		{"feed": feed_id, "post": post_id, "subscriber": reactor_id,
		 "name": name, "reaction": reaction}, reactor_id)

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
	comment_data = mochi.db.row("select * from comments where id=? and feed=?", comment_id, feed_id)
	if not comment_data:
		e.stream.write({"error": "Comment not found"})
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

	# Broadcast to subscribers
	broadcast_event(feed_id, "comment/react",
		{"feed": feed_id, "post": comment_data["post"], "comment": comment_id,
		 "subscriber": reactor_id, "name": name, "reaction": reaction}, reactor_id)

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
		feed = mochi.db.row("select * from feeds where id=? or fingerprint=?", feed_id, feed_id)

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
