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

# Helper: Check if current user has access to perform an operation
# Users with "manage" permission automatically have all other permissions
def check_access(a, feed_id, operation):
    resource = "feed/" + feed_id
    user = None
    if a.user and a.user.identity:
        user = a.user.identity.id
    if mochi.access.check(user, resource, operation):
        return True
    # If checking a non-manage operation, also check if user has manage access
    if operation != "manage":
        return mochi.access.check(user, resource, "manage")
    return False

# Helper: Check if remote user (from event header) has access to perform an operation
def check_event_access(user_id, feed_id, operation):
    resource = "feed/" + feed_id
    if mochi.access.check(user_id, resource, operation):
        return True
    # If checking a non-manage operation, also check if user has manage access
    if operation != "manage":
        return mochi.access.check(user_id, resource, "manage")
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

def feed_by_id(user_id, feed_id):
	feeds = mochi.db.rows("select * from feeds where id=?", feed_id)
	if len(feeds) == 0:
		feeds = mochi.db.rows("select * from feeds where fingerprint=?", feed_id)
		if len(feeds) == 0:
			return None
	
	feed_data = feeds[0]

	if user_id != None:
		feed_data["entity"] = mochi.entity.get(feed_data.get("id"))
	
	mochi.log.debug("\n    feed_by_id.feed_data='%v'", feed_data)
	return feed_data

def feed_comments(user_id, post_data, parent_id, depth):
	if (depth > 1000):
		return None
	
	if parent_id == None:
		parent_id = ""

	debug_str = "\n    feed_comments parent={}, depth={}, post_data={}".format(parent_id, depth, post_data)
	comments = mochi.db.rows("select * from comments where post=? and parent=? order by created desc", post_data["id"], parent_id)
	for i in range(len(comments)):
		comments[i]["feed_fingerprint"] = mochi.entity.fingerprint(comments[i]["feed"])
		comments[i]["body_markdown"] = mochi.markdown.render(comments[i]["body"]) # WIP
		comments[i]["created_string"] = mochi.time.local(comments[i]["created"])
		comments[i]["user"] = user_id or ""

		my_reaction = mochi.db.row("select reaction from reactions where comment=? and subscriber=?", comments[i]["id"], user_id)
		if my_reaction:
			comments[i]["my_reaction"] = my_reaction["reaction"]
		else:
			comments[i]["my_reaction"] = ""

		comments[i]["reactions"] = mochi.db.rows("select * from reactions where comment=? and subscriber!=? and reaction!='' order by name", comments[i]["id"], user_id)
		
		comments[i]["children"] = feed_comments(user_id, post_data, comments[i]["id"], depth + 1)
		
		indent = "      "
		for _ in range(depth):
			indent += "  "
		debug_str += "\n{}by {} at {}\n{}children:{}".format(indent, comments[i]["user"], comments[i]["created_string"], indent, comments[i]["children"])
	debug_str += "\n    total comments:{}".format(len(comments))
	
	mochi.log.debug(debug_str)
	return comments 

def is_reaction_valid(reaction):
	if mochi.valid(reaction, "^(|like|dislike|laugh|amazed|love|sad|angry|agree|disagree)$"):
		return reaction
	return ""

def feed_update(user_id, feed_data):
	feed_id = feed_data["id"]
	subscribers = mochi.db.rows("select * from subscribers where feed=?", feed_id)
	mochi.db.execute("update feeds set subscribers=?, updated=? where id=?", len(subscribers), mochi.time.now(), feed_id)
	
	for sub in subscribers:
		subscriber_id = sub["id"]
		if subscriber_id == user_id:
			continue
		if not subscriber_id:
			mochi.log.debug("\n    Empty subscriber ID for feed '%v'", feed_id)
			continue
		mochi.message.send(
			headers(feed_id, subscriber_id, "update"),
			{"subscribers": len(subscribers)}
		)
	mochi.log.debug("\n    feed_update feed_data='%v'", feed_data)

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
	mochi.log.debug("\n    send_recent_posts feed_id='%v' len(feed_posts)='%v'", feed_id, len(feed_posts))

def is_feed_owner(user_id, feed_data):
	mochi.log.debug("\n    is_feed_owner u='%v', fd='%v'", user_id, feed_data)
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
	mochi.db.execute("replace into reactions ( feed, post, subscriber, name, reaction ) values ( ?, ?, ?, ?, ? )", post_data["feed"], post_data["id"], subscriber_id, name, reaction)
	set_post_updated(post_data["id"])
	set_feed_updated(post_data["feed"])

def comment_reaction_set(comment_data, subscriber_id, name, reaction):
	mochi.db.execute("replace into reactions ( feed, post, comment, subscriber, name, reaction ) values ( ?, ?, ?, ?, ?, ? )", comment_data["feed"], comment_data["post"], comment_data["id"], subscriber_id, name, reaction)
	set_post_updated(comment_data["post"])
	set_feed_updated(comment_data["feed"])

def headers(from_id, to_id, event):
	return {"from": from_id, "to": to_id, "service": "feeds", "event": event}
	
# Create database
def database_create():
	mochi.db.execute("create table settings ( name text not null primary key, value text not null )")
	mochi.db.execute("replace into settings ( name, value ) values ( 'schema', 4 )")

	mochi.db.execute("create table feeds ( id text not null primary key, fingerprint text not null, name text not null, privacy text not null default 'public', owner integer not null default 0, subscribers integer not null default 0, updated integer not null, server text not null default '' )")
	mochi.db.execute("create index feeds_fingerprint on feeds( fingerprint )")
	mochi.db.execute("create index feeds_name on feeds( name )")
	mochi.db.execute("create index feeds_updated on feeds( updated )")

	mochi.db.execute("create table subscribers ( feed references feeds( id ), id text not null, name text not null default '', primary key ( feed, id ) )")
	mochi.db.execute("create index subscriber_id on subscribers( id )")

	mochi.db.execute("create table posts ( id text not null primary key, feed references feeds( id ), body text not null, created integer not null, updated integer not null, edited integer not null default 0 )")
	mochi.db.execute("create index posts_feed on posts( feed )")
	mochi.db.execute("create index posts_created on posts( created )")
	mochi.db.execute("create index posts_updated on posts( updated )")

	mochi.db.execute("create table comments ( id text not null primary key, feed references feeds( id ), post references posts( id ), parent text not null, subscriber text not null, name text not null, body text not null, created integer not null, edited integer not null default 0 )")
	mochi.db.execute("create index comments_feed on comments( feed )")
	mochi.db.execute("create index comments_post on comments( post )")
	mochi.db.execute("create index comments_parent on comments( parent )")
	mochi.db.execute("create index comments_created on comments( created )")

	mochi.db.execute("create table reactions ( feed references feeds( id ), post references posts( id ), comment text not null default '', subscriber text not null, name text not null, reaction text not null default '', primary key ( feed, post, comment, subscriber ) )")
	mochi.db.execute("create index reactions_post on reactions( post )")
	mochi.db.execute("create index reactions_comment on reactions( comment )")

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
        "post": can_manage or check_access(a, feed["id"], "post"),
        "comment": can_manage or check_access(a, feed["id"], "comment"),
        "manage": can_manage,
    } if a.user else {"view": True, "post": False, "comment": False, "manage": False}

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

	mochi.log.debug("\n    action_view user_id='%v', feed_id='%v', server='%v'", user_id, feed_id, server)

	# Get local feed data if available
	feed_data = None
	if type(feed_id) == type("") and (mochi.valid(feed_id, "entity") or mochi.valid(feed_id, "fingerprint")):
		feed_data = feed_by_id(user_id, feed_id)

	# Determine if we need to fetch remotely
	# Remote if: specific feed requested AND (not local OR local but not owner)
	is_remote = False
	if feed_id and feed_data:
		if feed_data.get("owner") != 1:
			is_remote = True
			if not server:
				server = feed_data.get("server", "")
	elif feed_id and not feed_data:
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
		is_public = feed_data.get("privacy", "public") == "public"
		is_owner = is_feed_owner(user_id, feed_data)
		is_subscriber = mochi.db.exists("select 1 from subscribers where feed=? and id=?", feed_data["id"], user_id)
		if not is_public and not is_owner and not is_subscriber:
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
			if pf_data:
				is_public = pf_data.get("privacy", "public") == "public"
				is_owner = is_feed_owner(user_id, pf_data)
				is_subscriber = mochi.db.exists("select 1 from subscribers where feed=? and id=?", pf_data["id"], user_id)
				if not is_public and not is_owner and not is_subscriber:
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
		posts[i]["attachments"] = mochi.attachment.list(posts[i]["id"])

		my_reaction = mochi.db.row("select reaction from reactions where post=? and subscriber=? and comment=?", posts[i]["id"], user_id, "")
		posts[i]["my_reaction"] = my_reaction["reaction"] if my_reaction else ""
		posts[i]["reactions"] = mochi.db.rows("select * from reactions where post=? and comment='' and subscriber!=? and reaction!='' order by name", posts[i]["id"], user_id)
		posts[i]["comments"] = feed_comments(user_id, posts[i], None, 0)

	is_owner = is_feed_owner(user_id, feed_data)
	feeds = mochi.db.rows("select * from feeds order by updated desc")

	next_cursor = None
	if has_more and len(posts) > 0:
		next_cursor = posts[-1]["created"]

	return {
		"data": {
			"feed": feed_data,
			"posts": posts,
			"feeds": feeds,
			"owner": is_owner,
			"user": user_id,
			"hasMore": has_more,
			"nextCursor": next_cursor
		}
	}

# Helper: Fetch posts from remote feed via P2P
def view_remote(a, user_id, feed_id, server, local_feed):
	if not user_id:
		a.error(401, "Not logged in")
		return

	peer_id = None
	feed_name = ""

	if server:
		peer_id = mochi.peer.connect.url(server)
		if not peer_id:
			a.error(502, "Unable to connect to server")
			return
	else:
		directory = mochi.directory.get(feed_id)
		if not directory:
			a.error(404, "Feed not found in directory")
			return
		feed_name = directory.get("name", "")

	mochi.log.debug("\n    view_remote: requesting posts from feed_id='%v' peer_id='%v'", feed_id, peer_id)

	if peer_id:
		s = mochi.stream.peer(
			peer_id,
			{"from": user_id, "to": feed_id, "service": "feeds", "event": "view"},
			{"feed": feed_id}
		)
	else:
		s = mochi.stream(
			{"from": user_id, "to": feed_id, "service": "feeds", "event": "view"},
			{"feed": feed_id}
		)

	response = s.read()
	s.close()

	if not response:
		a.error(500, "No response from feed owner")
		return

	if response.get("error"):
		a.error(403, response["error"])
		return

	if not feed_name:
		feed_name = response.get("name", "")

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
			"posts": response.get("posts", []),
			"feeds": mochi.db.rows("select * from feeds order by updated desc"),
			"owner": False,
			"user": user_id,
			"hasMore": False,
			"nextCursor": None
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

	mochi.log.debug("\n    action_probe server='%v' feed_id='%v'", server, feed_id)

	# Connect to server
	peer_id = mochi.peer.connect.url(server)
	if not peer_id:
		a.error(502, "Unable to connect to server")
		return

	# Query feed info via P2P stream to the specific peer
	s = mochi.stream.peer(
		peer_id,
		{"from": user_id, "to": feed_id, "service": "feeds", "event": "info"},
		{"feed": feed_id}
	)
	if not s:
		a.error(502, "Unable to reach feed")
		return

	response = s.read()
	if not response or response.get("error"):
		a.error(404, response.get("error", "Feed not found"))
		return

	# Return feed info as a directory-like entry
	return {"data": {
		"id": feed_id,
		"name": response.get("name", ""),
		"fingerprint": response.get("fingerprint", ""),
		"class": "feed",
		"server": server,
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
	mochi.log.debug("\n    action_post_new current='%v'", a.input("current"))

# New post
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

    post_uid = mochi.uid()
    if mochi.db.exists("select id from posts where id=?", post_uid):
        a.error(500, "Duplicate ID")
        return

    now = mochi.time.now()
    mochi.db.execute("insert into posts (id, feed, body, created, updated) values (?, ?, ?, ?, ?)",
        post_uid, feed_id, body, now, now)
    set_feed_updated(feed_id)

    # Get subscribers for notification
    subscribers = mochi.db.rows("select id from subscribers where feed=? and id!=?", feed_id, user_id)

    # Save any uploaded attachments and notify subscribers via _attachment/create events
    attachments = mochi.attachment.save(post_uid, "files", [], [], subscribers)

    # Send post to subscribers (attachments sent separately via federation)
    broadcast_event(feed_id, "post/create", {"id": post_uid, "created": now, "body": body}, user_id)

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
		mochi.db.execute("update posts set body=?, updated=?, edited=? where id=?", body, now, now, post_id)

		subscribers = [s["id"] for s in mochi.db.rows("select id from subscribers where feed=?", info["id"])]

		# Handle attachment changes
		keep_ids = a.input_list("attachments")  # IDs to keep, in order
		if keep_ids:
			# Delete attachments not in the keep list
			existing = mochi.attachment.list(post_id)
			for att in existing:
				if att["id"] not in keep_ids:
					mochi.attachment.delete(att["id"], subscribers)

			# Reorder attachments according to keep_ids order
			for i, att_id in enumerate(keep_ids):
				mochi.attachment.move(att_id, i, subscribers)

		# Save new attachments (if any files were uploaded)
		mochi.attachment.save(post_id, "files", [], [], subscribers)

		broadcast_event(info["id"], "post/edit", {"post": post_id, "body": body, "edited": now}, user_id)
		return {"data": {"ok": True}}

	elif info.get("server"):
		# Remote feed - stream to owner
		s = mochi.stream.peer(
			mochi.peer.connect.url(info["server"]),
			{"from": user_id, "to": feed_id, "service": "feeds", "event": "post/edit"},
			{"feed": feed_id, "post": post_id, "body": body}
		)
		response = s.read()
		s.close()
		if response and response.get("error"):
			a.error(403, response["error"])
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
		return {"data": {"ok": True}}

	elif info.get("server"):
		# Remote feed - stream to owner
		s = mochi.stream.peer(
			mochi.peer.connect.url(info["server"]),
			{"from": user_id, "to": feed_id, "service": "feeds", "event": "post/delete"},
			{"feed": feed_id, "post": post_id}
		)
		response = s.read()
		s.close()
		if response and response.get("error"):
			a.error(403, response["error"])
			return
		return {"data": response or {"ok": True}}

	a.error(403, "Not authorized")

def action_subscribe(a): # feeds_subscribe
	mochi.log.debug("\n    action_subscribe called")
	if not a.user.identity.id:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id

	feed_id = a.input("feed")
	server = a.input("server")
	mochi.log.debug("\n    action_subscribe feed_id='%v' server='%v'", feed_id, server)
	if not mochi.valid(feed_id, "entity"):
		a.error(400, "Invalid ID")
		return

	feed_name = None
	feed_fingerprint = None

	if server:
		# Connect to server directly and query feed info
		peer_id = mochi.peer.connect.url(server)
		if not peer_id:
			a.error(502, "Unable to connect to server")
			return

		# Query feed info via P2P stream to the specific peer
		s = mochi.stream.peer(
			peer_id,
			{"from": user_id, "to": feed_id, "service": "feeds", "event": "info"},
			{"feed": feed_id}
		)
		if not s:
			a.error(502, "Unable to reach feed")
			return

		response = s.read()
		if not response or response.get("error"):
			a.error(404, response.get("error", "Feed not found"))
			return

		feed_name = response.get("name", "")
		feed_fingerprint = response.get("fingerprint", "")
	else:
		# Use directory lookup
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
	mochi.log.debug("\n    action_unsubscribe called")
	if not a.user.identity.id:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id
	
	feed_id = a.input("feed")
	mochi.log.debug("\n    action_unsubscribe feed_id='%v'", feed_id)
	if not mochi.valid(feed_id, "entity") and not mochi.valid(feed_id, "fingerprint"):
		a.error(400, "Invalid ID")
		return

	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		a.error(404, "Feed not found")
		return
	
	# feed_id might be fingerprint, ensure it is full entity id
	feed_id = feed_data["id"]

	mochi.log.debug("\n    feed_id='%v'\n    feed_data='%v'", feed_id, feed_data)

	if feed_data["entity"]:
		a.error(400, "You own this feed")
		return

	# if not feed_data["entity"]:
	if not is_feed_owner(user_id, feed_data):
		mochi.log.debug("\n    UNSUBBING '%v' from '%v', entity='%v'", user_id, feed_id, feed_data["entity"])

		mochi.db.execute("delete from reactions where feed=?", feed_id)
		mochi.db.execute("delete from comments where feed=?", feed_id)
		mochi.db.execute("delete from posts where feed=?", feed_id)
		mochi.db.execute("delete from subscribers where feed=?", feed_id)
		mochi.db.execute("delete from feeds where id=?", feed_id)

		mochi.message.send(headers(user_id, feed_id, "unsubscribe"))

	return {"data": {"success": True}}
	mochi.log.debug("\n    action_unsubscribe feed_id='%v'", feed_id)

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
		if not is_public and not check_access(a, feed["id"], "read"):
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

	# Check directory for the feed if not local
	if not feed:
		directory = mochi.directory.get(feed_id)
		if not directory:
			a.error(404, "Feed not found")
			return

	# Create stream to feed owner and request attachment
	s = mochi.stream(
		{"from": user_id, "to": feed_id, "service": "feeds", "event": "attachment/view"},
		{}
	)

	# Write the attachment request
	s.write({"attachment": attachment_id})

	# Read file from stream to temp location and serve it
	temp = "temp/attachment-" + attachment_id
	size = s.read_to_file(temp)
	s.close()

	if size <= 0:
		a.error(404, "Attachment not found or empty")
		return

	a.write_from_file(temp)

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
		if not is_public and not check_access(a, feed["id"], "read"):
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

	# Check directory for the feed if not local
	if not feed:
		directory = mochi.directory.get(feed_id)
		if not directory:
			a.error(404, "Feed not found")
			return

	# Create stream to feed owner and request thumbnail
	s = mochi.stream(
		{"from": user_id, "to": feed_id, "service": "feeds", "event": "attachment/view"},
		{}
	)

	# Write the attachment request with thumbnail flag
	s.write({"attachment": attachment_id, "thumbnail": True})

	# Read file from stream to temp location and serve it
	temp = "temp/thumb-" + attachment_id
	size = s.read_to_file(temp)
	s.close()

	if size <= 0:
		a.error(404, "Thumbnail not found or empty")
		return

	a.write_from_file(temp)

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

    # If feed is local and we own it, handle locally
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
        else:
            mochi.message.send(
                headers(user_id, feed_id, "comment/submit"),
                {"id": uid, "post": post_id, "parent": parent_id, "body": body}
            )

        return {"data": {"id": uid, "feed": feed, "post": post_id}}

    # Remote feed - forward via P2P
    if not mochi.valid(feed_id, "entity") and not mochi.valid(feed_id, "fingerprint"):
        a.error(400, "Invalid feed ID")
        return

    if not mochi.valid(post_id, "id"):
        a.error(400, "Invalid post ID")
        return

    # Check directory for the feed if not local
    if not feed:
        directory = mochi.directory.get(feed_id)
        if not directory:
            a.error(404, "Feed not found")
            return

    mochi.log.debug("\n    action_comment_create: sending comment to remote feed_id='%v' post='%v'", feed_id, post_id)

    # Create stream to feed owner and send comment
    s = mochi.stream(
        {"from": user_id, "to": feed_id, "service": "feeds", "event": "comment/add"},
        {"feed": feed_id, "post": post_id, "parent": parent_id, "body": body, "name": a.user.identity.name}
    )

    # Read response (blocks until feed owner responds)
    response = s.read()
    s.close()

    if not response:
        a.error(500, "No response from feed owner")
        return

    if response.get("error"):
        a.error(403, response["error"])
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
		return {"data": {"ok": True}}

	elif info.get("server"):
		# Remote feed - stream to owner
		s = mochi.stream.peer(
			mochi.peer.connect.url(info["server"]),
			{"from": user_id, "to": feed_id, "service": "feeds", "event": "comment/edit"},
			{"feed": feed_id, "comment": comment_id, "body": body}
		)
		response = s.read()
		s.close()
		if response and response.get("error"):
			a.error(403, response["error"])
			return
		return {"data": response or {"ok": True}}

	a.error(403, "Not authorized")

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
		return {"data": {"ok": True}}

	elif info.get("server"):
		# Remote feed - stream to owner
		s = mochi.stream.peer(
			mochi.peer.connect.url(info["server"]),
			{"from": user_id, "to": feed_id, "service": "feeds", "event": "comment/delete"},
			{"feed": feed_id, "comment": comment_id}
		)
		response = s.read()
		s.close()
		if response and response.get("error"):
			a.error(403, response["error"])
			return
		return {"data": response or {"ok": True}}

	a.error(403, "Not authorized")

# Helper to recursively delete a comment and its replies
def delete_comment_tree(comment_id):
	children = mochi.db.query("select id from comments where parent=?", comment_id)
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

    reaction = is_reaction_valid(a.input("reaction"))
    if not reaction:
        a.error(400, "Invalid reaction")
        return

    # Get local feed data if available
    feed = None
    if feed_id and (mochi.valid(feed_id, "entity") or mochi.valid(feed_id, "fingerprint")):
        feed = feed_by_id(user_id, feed_id)

    # If feed is local and we own it, handle locally
    if feed and feed.get("owner") == 1:
        feed_id = feed["id"]

        post_data = mochi.db.row("select * from posts where id=? and feed=?", post_id, feed_id)
        if not post_data:
            a.error(404, "Post not found")
            return

        # Reactions require comment permission
        resource = "feed/" + feed_id
        if not mochi.access.check(user_id, resource, "comment") and not mochi.access.check(user_id, resource, "manage"):
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
                headers(user_id, feed_id, "post/react"),
                {"post": post_id, "name": a.user.identity.name, "reaction": reaction}
            )

        return {"data": {"feed": feed, "id": post_id, "reaction": reaction}}

    # Remote feed - forward via P2P
    if not mochi.valid(feed_id, "entity") and not mochi.valid(feed_id, "fingerprint"):
        a.error(400, "Invalid feed ID")
        return

    if not mochi.valid(post_id, "id"):
        a.error(400, "Invalid post ID")
        return

    # Check directory for the feed if not local
    if not feed:
        directory = mochi.directory.get(feed_id)
        if not directory:
            a.error(404, "Feed not found")
            return

    mochi.log.debug("\n    action_post_react: sending reaction to remote feed_id='%v' post='%v'", feed_id, post_id)

    # Create stream to feed owner and send reaction
    s = mochi.stream(
        {"from": user_id, "to": feed_id, "service": "feeds", "event": "post/react/add"},
        {"feed": feed_id, "post": post_id, "reaction": reaction, "name": a.user.identity.name}
    )

    # Read response (blocks until feed owner responds)
    response = s.read()
    s.close()

    if not response:
        a.error(500, "No response from feed owner")
        return

    if response.get("error"):
        a.error(403, response["error"])
        return

    return {"data": {"feed": feed_id, "post": post_id, "reaction": reaction}}

def action_comment_react(a):
    if not a.user:
        a.error(401, "Not logged in")
        return
    user_id = a.user.identity.id

    feed_id = a.input("feed")
    comment_id = a.input("comment")

    reaction = is_reaction_valid(a.input("reaction"))
    if not reaction:
        a.error(400, "Invalid reaction")
        return

    # Get local feed data if available
    feed = None
    if feed_id and (mochi.valid(feed_id, "entity") or mochi.valid(feed_id, "fingerprint")):
        feed = feed_by_id(user_id, feed_id)

    # If feed is local and we own it, handle locally
    if feed and feed.get("owner") == 1:
        feed_id = feed["id"]

        comment_data = mochi.db.row("select * from comments where id=? and feed=?", comment_id, feed_id)
        if not comment_data:
            a.error(404, "Comment not found")
            return

        # Reactions require comment permission
        resource = "feed/" + feed_id
        if not mochi.access.check(user_id, resource, "comment") and not mochi.access.check(user_id, resource, "manage"):
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
                headers(user_id, feed_id, "comment/react"),
                {"comment": comment_id, "name": a.user.identity.name, "reaction": reaction}
            )

        return {"data": {"feed": feed, "post": comment_data["post"], "comment": comment_id, "reaction": reaction}}

    # Remote feed - forward via P2P
    if not mochi.valid(feed_id, "entity") and not mochi.valid(feed_id, "fingerprint"):
        a.error(400, "Invalid feed ID")
        return

    if not mochi.valid(comment_id, "id"):
        a.error(400, "Invalid comment ID")
        return

    # Check directory for the feed if not local
    if not feed:
        directory = mochi.directory.get(feed_id)
        if not directory:
            a.error(404, "Feed not found")
            return

    mochi.log.debug("\n    action_comment_react: sending reaction to remote feed_id='%v' comment='%v'", feed_id, comment_id)

    # Create stream to feed owner and send reaction
    s = mochi.stream(
        {"from": user_id, "to": feed_id, "service": "feeds", "event": "comment/react/add"},
        {"feed": feed_id, "comment": comment_id, "reaction": reaction, "name": a.user.identity.name}
    )

    # Read response (blocks until feed owner responds)
    response = s.read()
    s.close()

    if not response:
        a.error(500, "No response from feed owner")
        return

    if response.get("error"):
        a.error(403, response["error"])
        return

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

    resource = "feed/" + feed["id"]
    rules = mochi.access.list.resource(resource)
    return {"data": {"rules": rules}}

# Grant access to a subject
def action_access_grant(a):
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
    operation = a.input("operation")

    if not subject:
        a.error(400, "Subject is required")
        return
    if len(subject) > 255:
        a.error(400, "Subject too long")
        return

    if not operation:
        a.error(400, "Operation is required")
        return

    if operation not in ["view", "post", "comment", "manage", "*"]:
        a.error(400, "Invalid operation")
        return

    resource = "feed/" + feed["id"]
    mochi.access.allow(subject, resource, operation, a.user.identity.id)
    return {"data": {"success": True}}

# Deny access to a subject
def action_access_deny(a):
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
    operation = a.input("operation")

    if not subject:
        a.error(400, "Subject is required")
        return
    if len(subject) > 255:
        a.error(400, "Subject too long")
        return

    if not operation:
        a.error(400, "Operation is required")
        return

    if operation not in ["view", "post", "comment", "manage", "*"]:
        a.error(400, "Invalid operation")
        return

    resource = "feed/" + feed["id"]
    mochi.access.deny(subject, resource, operation, a.user.identity.id)
    return {"data": {"success": True}}

# Revoke access from a subject
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
    operation = a.input("operation")

    if not subject:
        a.error(400, "Subject is required")
        return
    if len(subject) > 255:
        a.error(400, "Subject too long")
        return

    if not operation:
        a.error(400, "Operation is required")
        return

    resource = "feed/" + feed["id"]
    mochi.access.revoke(subject, resource, operation)
    return {"data": {"success": True}}

# EVENTS

def event_comment_create(e): # feeds_comment_create_event
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("from"))
	mochi.log.debug("\n    event_comment_create user_id='%v', feed_data='%v'", user_id, feed_data)
	if not feed_data:
		mochi.log.info("Feed dropping post to unknown feed")
		return
	feed_id = feed_data["id"]
		
	comment = {"id": e.content("id"), "post": e.content("post"), "parent": e.content("parent"), "created": e.content("created"), "subscriber": e.content("subscriber"), "name": e.content("name"), "body": e.content("body")}

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
	mochi.log.debug("\n    event_comment_create2 feed_id='%v', comment='%v'", feed_id, comment)

def event_comment_submit(e): # feeds_comment_submit_event
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("to"))
	mochi.log.debug("\n    event_comment_submit1 user_id='%v', feed_data='%v'", user_id, feed_data)
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
	comment["name"] = sub_data["name"]

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
	mochi.log.debug("\n    event_comment_submit2 feed_id='%v', comment='%v'", feed_id, comment)

def event_comment_reaction(e): # feeds_comment_reaction_event
	user_id = e.user.identity.id
	mochi.log.debug("\n    event_comment_reaction1 user_id='%v''", user_id)
	if not mochi.valid(e.content("name"), "name"):
		mochi.log.info("Feed dropping comment reaction with invalid name '%s'", )
		return
	
	comment_data = mochi.db.rows("select * from comments where id=?", e.content("comment"))
	if not comment_data:
		mochi.log.info("Feed dropping comment reaction for unknown comment")
		return
	comment_id = comment_data["id"]

	feed_data = feed_by_id(user_id, comment_data["feed"])
	if not feed_data:
		mochi.log.info("Feed dropping comment reaction for unknown feed")
		return
	feed_id = feed_data["id"]

	reaction = is_reaction_valid(e.content("reaction"))
	if not reaction:
		mochi.log.info("Feed dropping invalid comment reaction")
		return
	
	if is_feed_owner(user_id, feed_data):
		if e.header("from") != comment_data["feed"]:
			mochi.log.info("Feed dropping comment reaction from unknown owner")
			return
		comment_reaction_set(comment_data, e.content("subscriber"), e.content("name"), reaction)
	else:
		sub_data = get_feed_subscriber(feed_data, e.header("from"))
		if not sub_data:
			mochi.info("Feed dropping comment reaction from unknown subscriber '%s'", e.header("from"))
			return

		comment_reaction_set(comment_data, e.header("from"), e.content("name"), reaction)

		subs = mochi.db.rows("select* from subscribers where feed=?", feed_id)
		for s in subs:
			if s["id"] == e.header("from") or s["id"] == user_id:
				continue
			mochi.message.send(
				headers(feed_id, s["id"], "comment/react"),
				{"feed": feed_id, "post": comment_data["post"], "comment": comment_id, "subscriber": e.header("from"), "name": e.content("name"), "reaction": reaction}
			)
	mochi.log.debug("\n    event_comment_reaction2 feed_id='%v', comment_data='%v'", feed_id, comment_data)

def event_post_create(e): # feeds_post_create_event
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("from"))
	mochi.log.debug("\n    event_post_create1 user_id='%v', feed_data='%v'", user_id, feed_data)
	if not feed_data:
		mochi.log.info("Feed dropping post to unknown feed")
		return
	
	post = {"id": e.content("id"), "created": e.content("created"), "body": e.content("body")}

	if not mochi.valid(post["id"], "id"):
		mochi.log.info("Feed dropping post with invalid ID '%s'", post["id"])
		return

	if mochi.db.exists("select id from posts where id=?", post["id"]):
		mochi.log.info("Feed dropping post with duplicate ID '%s'", post["id"])
		return

	if not mochi.valid(post["body"], "text"):
		mochi.log.info("Feed dropping post with invalid body '%s'", post["body"])
		return

	mochi.db.execute("replace into posts ( id, feed, body, created, updated ) values ( ?, ?, ?, ?, ? )", post["id"], feed_data["id"], post["body"], post["created"], post["created"])
	# Attachments arrive via _attachment/create events and are saved automatically

	set_feed_updated(feed_data["id"])
	mochi.log.debug("\n    event_post_create2 post='%v', feed_data='%v'", post, feed_data)

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

	mochi.db.execute("update posts set body=?, updated=?, edited=? where id=?", body, edited, edited, post_id)
	set_feed_updated(feed_data["id"])
	mochi.log.debug("\n    event_post_edit post_id='%v', feed='%v'", post_id, feed_data["id"])

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
	mochi.log.debug("\n    event_post_delete post_id='%v', feed='%v'", post_id, feed_data["id"])

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
	mochi.log.debug("\n    event_comment_edit comment_id='%v', feed='%v'", comment_id, feed_data["id"])

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
	mochi.log.debug("\n    event_comment_delete comment_id='%v', feed='%v'", comment_id, feed_data["id"])

def event_post_reaction(e): # feeds_post_reaction_event
	user_id = e.user.identity.id
	mochi.log.debug("\n    event_post_reaction1 user_id='%v'", user_id)
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

	reaction = is_reaction_valid(e.content("reaction"))
	if not reaction:
		mochi.log.info("Feed dropping invalid post reaction")
		return
	
	if is_feed_owner(user_id, feed_data):
		if e.header("from") != post_data["feed"]:
			mochi.log.info("Feed dropping post reaction from unknown owner")
			return
		post_reaction_set(post_data, e.content("subscriber"), e.content("name"), reaction)
	else:
		sub_data = get_feed_subscriber(feed_data, e.header("from"))
		if not sub_data:
			mochi.info("Feed dropping post reaction from unknown subscriber '%s'", e.header("from"))
			return

		post_reaction_set(post_data, e.header("from"), e.content("name"), reaction)

		subs = mochi.db.rows("select* from subscribers where feed=?", feed_id)
		for s in subs:
			if s["id"] == e.header("from") or s["id"] == user_id:
				continue
			mochi.message.send(
				headers(feed_id, s["id"], "post/react"),
				{"feed": feed_id, "post": post_data["post"], "subscriber": e.header("from"), "name": e.content("name"), "reaction": reaction}
			)
	mochi.log.debug("\n    event_post_reaction2 feed_data='%v', post_data='%v'", feed_data, post_data)

# Handle feed info request from remote server (stream-based)
def event_info(e):
	user_id = e.user.identity.id if e.user and e.user.identity else None
	feed_id = e.header("to")

	mochi.log.debug("\n    event_info: request for feed_id='%v' from='%v'", feed_id, e.header("from"))

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
	mochi.log.debug("\n    event_subscribe1 feed_id='%v'", e.header("to"))
	if not feed_data:
		return
	
	name = e.content("name")
	if not mochi.valid(name, "line"):
		mochi.log.debug("Feeds dropping subscribe with invalid name '%s'", name)
		return

	mochi.db.execute("insert or ignore into subscribers ( feed, id, name ) values ( ?, ?, ? )", feed_data["id"], e.header("from"), name)
	mochi.db.execute("update feeds set subscribers=(select count(*) from subscribers where feed=?), updated=? where id=?", feed_data["id"], mochi.time.now(), feed_data["id"])
	
	feed_update(user_id, feed_data)
	send_recent_posts(user_id, feed_data, e.header("from"))
	mochi.log.debug("\n    event_subscribe2 feed_data='%v'", feed_data)

def event_unsubscribe(e): # feeds_unsubscribe_event
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("to"))
	mochi.log.debug("\n    event_unsubscribe1 feed_id='%v'", e.header("to"))
	if not feed_data:
		return

	mochi.db.execute("delete from subscribers where feed=? and id=?", e.header("to"), e.header("from"))
	feed_update(user_id, feed_data)
	mochi.log.debug("\n    event_unsubscribe2 feed_data='%v'", feed_data)

# Handle notification that a feed has been deleted by its owner
def event_deleted(e):
	feed_id = e.content("feed")
	if not feed_id:
		feed_id = e.header("from")

	mochi.log.debug("\n    event_deleted feed_id='%v'", feed_id)

	# Delete local subscription data for this feed
	mochi.db.execute("delete from reactions where feed=?", feed_id)
	mochi.db.execute("delete from comments where feed=?", feed_id)
	mochi.db.execute("delete from posts where feed=?", feed_id)
	mochi.db.execute("delete from subscribers where feed=?", feed_id)
	mochi.db.execute("delete from feeds where id=?", feed_id)

def event_update(e): # feeds_update_event
	feed_data = feed_by_id(e.content("feed"))
	mochi.log.debug("\n    event_update1 feed_data='%v'", feed_data)
	if not feed_data:
		return

	subscribers = e.content("subscribers", "0")
	if not mochi.valid(subscribers, "natural"):
		mochi.log.info("Feed dropping update with invalid number of subscribers '%s'", subscribers)
		return

	mochi.db.execute("update feeds set subscribers=?, updated=? where id=?", subscribers, mochi.time.now(), feed_data["id"])
	mochi.log.debug("\n    event_update2 subscribers='%v', feed_data='%v'", subscribers, feed_data)

# Handle view request from non-subscriber (stream-based request/response)
def event_view(e):
	user_id = e.user.identity.id if e.user and e.user.identity else None
	feed_id = e.header("to")

	mochi.log.debug("\n    event_view: request for feed_id='%v' from='%v'", feed_id, e.header("from"))

	# Get entity info (no user restriction) - for feeds we own
	entity = mochi.entity.info(feed_id)
	if not entity or entity.get("class") != "feed":
		e.stream.write({"error": "Feed not found"})
		return

	feed_name = entity.get("name", "")
	feed_fingerprint = entity.get("fingerprint", mochi.entity.fingerprint(feed_id))
	feed_privacy = entity.get("privacy", "public")

	# Note: "private" just means unlisted (not in search), not access-restricted

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
		post_data["attachments"] = mochi.attachment.list(post["id"])
		post_data["my_reaction"] = ""
		post_data["reactions"] = mochi.db.rows("select * from reactions where post=? and comment='' and reaction!='' order by name", post["id"])
		post_data["comments"] = feed_comments(user_id, post_data, None, 0)
		formatted_posts.append(post_data)

	mochi.log.debug("\n    event_view: sending %v posts for feed_id='%v'", len(formatted_posts), feed_id)
	e.stream.write({
		"name": feed_name,
		"fingerprint": feed_fingerprint,
		"privacy": feed_privacy,
		"posts": formatted_posts
	})

# Handle attachment view request from non-subscriber (stream-based request/response)
def event_attachment_view(e):
	user = e.user.identity.id if e.user and e.user.identity else None
	feed = e.header("to")

	# Read request data from stream (sent by action after opening)
	request = e.stream.read()
	if not request:
		e.stream.write({"error": "No request data"})
		return
	attachment = request.get("attachment", "")

	mochi.log.debug("\n    event_attachment_view: attachment='%v' feed='%v' from='%v'", attachment, feed, e.header("from"))

	# Get feed data - check if we own this feed
	feed_row = mochi.db.row("select * from feeds where id=?", feed)
	if not feed_row:
		e.stream.write({"error": "Feed not found"})
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
		e.stream.write({"error": "Attachment not found"})
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
		e.stream.write({"error": "Could not find attachment file"})
		return

	mochi.log.debug("\n    event_attachment_view: streaming '%v' from %v (thumbnail=%v)", found.get("name", ""), path, want_thumbnail)
	e.stream.write_from_file(path)

# Handle comment add request (stream-based request/response)
def event_comment_add(e):
	user_id = e.user.identity.id if e.user and e.user.identity else None
	feed_id = e.header("to")
	commenter_id = e.header("from")

	mochi.log.debug("\n    event_comment_add: comment for feed_id='%v' from='%v'", feed_id, commenter_id)

	# Get feed data
	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		e.stream.write({"error": "Feed not found"})
		return

	# Note: "private" just means unlisted (not in search), not access-restricted

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

	mochi.log.debug("\n    event_comment_add: created comment id='%v'", uid)
	e.stream.write({"id": uid})

# Handle post reaction add request (stream-based request/response)
def event_post_react_add(e):
	user_id = e.user.identity.id if e.user and e.user.identity else None
	feed_id = e.header("to")
	reactor_id = e.header("from")

	mochi.log.debug("\n    event_post_react_add: reaction for feed_id='%v' from='%v'", feed_id, reactor_id)

	# Get feed data
	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		e.stream.write({"error": "Feed not found"})
		return

	# Note: "private" just means unlisted (not in search), not access-restricted

	# Validate post exists
	post_id = e.content("post")
	post_data = mochi.db.row("select * from posts where id=? and feed=?", post_id, feed_id)
	if not post_data:
		e.stream.write({"error": "Post not found"})
		return

	# Validate reaction
	reaction = is_reaction_valid(e.content("reaction"))
	if not reaction:
		e.stream.write({"error": "Invalid reaction"})
		return

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

	mochi.log.debug("\n    event_post_react_add: stored reaction='%v'", reaction)
	e.stream.write({"success": True})

# Handle comment reaction add request (stream-based request/response)
def event_comment_react_add(e):
	user_id = e.user.identity.id if e.user and e.user.identity else None
	feed_id = e.header("to")
	reactor_id = e.header("from")

	mochi.log.debug("\n    event_comment_react_add: reaction for feed_id='%v' from='%v'", feed_id, reactor_id)

	# Get feed data
	feed_data = feed_by_id(user_id, feed_id)
	if not feed_data:
		e.stream.write({"error": "Feed not found"})
		return

	# Note: "private" just means unlisted (not in search), not access-restricted

	# Validate comment exists
	comment_id = e.content("comment")
	comment_data = mochi.db.row("select * from comments where id=? and feed=?", comment_id, feed_id)
	if not comment_data:
		e.stream.write({"error": "Comment not found"})
		return

	# Validate reaction
	reaction = is_reaction_valid(e.content("reaction"))
	if not reaction:
		e.stream.write({"error": "Invalid reaction"})
		return

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

	mochi.log.debug("\n    event_comment_react_add: stored reaction='%v'", reaction)
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
