# Mochi Feeds app

#load("db.star", "database_create")

def feed_by_id(user_id, feed_id):
	feeds = mochi.db.query("select * from feeds where id=?", feed_id)
	if len(feeds) == 0:
		feeds = mochi.db.query("select * from feeds where fingerprint=?", feed_id)
		if len(feeds) == 0:
			return None
	
	feed_data = feeds[0]

	if user_id != None:
		feed_data["entity"] = mochi.entity.get(feed_data.get("id"))
	
	mochi.log.debug("\n        feed_by_id.feed_data='%v'", feed_data)
	return feed_data

def feed_comments(user_id, post_row, parent_id, depth):
	if (depth > 1000):
		return None
	
	if parent_id == None:
		parent_id = ""

	comments = mochi.db.query("select * from comments where post=? and parent=? order by created desc", post_row["id"], parent_id)
	for i in range(len(comments)):
		comments[i]["feed_fingerprint"] = mochi.entity.fingerprint(comments[i]["feed"])
		comments[i]["body_markdown"] = mochi.markdown.render(comments[i]["body"]) # WIP
		comments[i]["created_string"] = mochi.time.local(comments[i]["created"])
		comments[i]["user"] = user_id or ""

		my_reaction = mochi.db.row("select reaction from reactions where comment=? and subscriber=?", comments[i]["id"], user_id)

		comments[i]["reactions"] = mochi.db.query("select * from reactions where comment=? and subscriber!=? and reaction!='' order by name", comments[i]["id"], user_id)
		
		comments[i]["children"] = feed_comments(user_id, comments[i], None, depth + 1)
	
	mochi.log.debug("\n Comments depth=%v, entries:%v,  '%v'", depth, len(comments), comments)
	return comments

def feeds_reaction_valid(reaction):
	if mochi.valid(reaction, "^(|like|dislike|laugh|amazed|love|sad|angry|agree|disagree)$"):
		return reaction
	return ""

def feed_update(user_id, feed_data):
	feed_id = feed_data["id"]
	subscribers = mochi.db.query("select * from subscribers where feed=?", feed_id)
	mochi.db.query("update feeds set subscribers=?, updated=? where id=?", len(subscribers), mochi.time.now(), feed_id)
	
	for sub in subscribers:
		subscriber_id = sub["id"]
		if subscriber_id == user_id:
			continue
		mochi.message.send(
			headers(feed_id, subscriber_id, "update"),
			{"subscribers": len(subscribers)}
		)

# Send recent posts to a new subscriber
def feed_send_recent_posts(user_id, feed_data, subscriber_id):
	feed_id = feed_data["id"]
	feed_posts = mochi.db.query("select * from posts where feed=? order by created desc limit 1000", feed_data["id"])

	for post in feed_posts:
		post["attachments"] = mochi.attachment.get(post["id"])
		mochi.message.send(headers(feed_id, subscriber_id, "post/create"), post)

		comments = mochi.db.query("select * from comments where post=? order by created", post["id"])
		for c in comments:
			mochi.message.send(headers(feed_id, subscriber_id, "comment/create"), c)

			reactions = mochi.db.query("select * from reactions where comment=?", c["id"])
			for r in reactions:
				mochi.message.send(
					headers(feed_id, subscriber_id, "comment/react"),
					{"feed": feed_id, "post": post["id"], "comment": c["id"], "subscriber": r["subscriber"], "name": r["name"], "reaction": r["reaction"]}
				)

		reactions = mochi.db.query("select * from reactions where post=?", post["id"])
		for r in reactions:
			mochi.message.send(
				headers(feed_id, subscriber_id, "post/react"),
				{"feed": feed_id, "post": post["id"], "subscriber": r["subscriber"], "name": r["name"], "reaction": r["reaction"]}
			)

def is_feed_owner(user_id, feed_data):
	if feed_data == None:
		return False
	if mochi.entity.get(feed_data.get("id")):
		return True
	return False

def set_feed_updated(feed_id, ts = -1):
	if ts == -1:
		ts = mochi.time.now()
	mochi.db.query("update feeds set updated=? where id=?", ts, feed_id)
	
def set_post_updated(post_id, ts = -1):
	if ts == -1:
		ts = mochi.time.now()
	mochi.db.query("update posts set updated=? where id=?", ts, post_id)

def get_feed_subscriber(feed_data, subscriber_id):
	sub_data = mochi.db.query("select * from subscribers where feed=? and id=?", feed_data["id"], subscriber_id)
	if not sub_data or len(sub_data) == 0:
		return None
	return sub_data

def feeds_post_reaction_set(post_data, subscriber_id, name, reaction):
	mochi.db.query("replace into reactions ( feed, post, subscriber, name, reaction ) values ( ?, ?, ?, ?, ? )", post_data["feed"], post_data["id"], subscriber_id, name, reaction)
	set_post_updated(post_data["id"])
	set_feed_updated(post_data["feed"])

def feeds_comment_reaction_set(comment_data, subscriber_id, name, reaction):
	mochi.db.query("replace into reactions ( feed, post, comment, subscriber, name, reaction ) values ( ?, ?, ?, ?, ?, ? )", comment_data["feed"], comment_data["post"], comment_data["id"], subscriber_id, name, reaction)
	set_post_updated(comment_data["post"])
	set_feed_updated(comment_data["feed"])
	return

def headers(from_id, to_id, event):
	return {"from": from_id, "to": to_id, "service": "feeds", "event": event}
	
# Create database
def database_create():
	mochi.db.query("create table settings ( name text not null primary key, value text not null )")
	mochi.db.query("replace into settings ( name, value ) values ( 'schema', 1 )")

	mochi.db.query("create table feeds ( id text not null primary key, fingerprint text not null, name text not null, privacy text not null default 'public', subscribers integer not null default 0, updated integer not null )")
	mochi.db.query("create index feeds_fingerprint on feeds( fingerprint )")
	mochi.db.query("create index feeds_name on feeds( name )")
	mochi.db.query("create index feeds_updated on feeds( updated )")

	mochi.db.query("create table subscribers ( feed references feeds( id ), id text not null, name text not null default '', primary key ( feed, id ) )")
	mochi.db.query("create index subscriber_id on subscribers( id )")

	mochi.db.query("create table posts ( id text not null primary key, feed references feeds( id ), body text not null, created integer not null, updated integer not null )")
	mochi.db.query("create index posts_feed on posts( feed )")
	mochi.db.query("create index posts_created on posts( created )")
	mochi.db.query("create index posts_updated on posts( updated )")

	mochi.db.query("create table comments ( id text not null primary key, feed references feeds( id ), post references posts( id ), parent text not null, subscriber text not null, name text not null, body text not null, created integer not null )")
	mochi.db.query("create index comments_feed on comments( feed )")
	mochi.db.query("create index comments_post on comments( post )")
	mochi.db.query("create index comments_parent on comments( parent )")
	mochi.db.query("create index comments_created on comments( created )")

	mochi.db.query("create table reactions ( feed references feeds( id ), post references posts( id ), comment text not null default '', subscriber text not null, name text not null, reaction text not null default '', primary key ( feed, post, comment, subscriber ) )")
	mochi.db.query("create index reactions_post on reactions( post )")
	mochi.db.query("create index reactions_comment on reactions( comment )")

# ACTIONS

def action_view(a): # feeds_view
	mochi.log.debug("\n    a.user.identity='%v'", a.user.identity)

	feed_id = a.input("feed")
	user_id = a.user.identity.id

	# mochi.log.debug("\n    FEED='%v' <%v>, user_id='%v'", feed_id, type(feed_id), user_id)
	# if type(feed_id) == type("") and (mochi.valid(feed_id, "entity") or mochi.valid(feed_id, "fingerprint")):
	# 	mochi.log.debug("\n    Feed='%v'", feed_id)
	# else:
	# 	mochi.log.debug("\n    No feed_id specified.")
	
	feed_data = None
	if type(feed_id) == type("") and (mochi.valid(feed_id, "entity") or mochi.valid(feed_id, "fingerprint")):
		feed_data = feed_by_id(user_id, feed_id)

	# mochi.log.debug("\n    1 feed_data='%v'", feed_data)

	if user_id == None and feed_data == None:
		a.error(404, "No feed specified")
		mochi.log.debug("\n    No feed specified")
		return

	post_id = a.input("post")
	
	if post_id:
		posts = mochi.db.query("select * from posts where id=?", post_id)
		mochi.log.debug("\n    1. (%v) posts='%v'", len(posts), posts)
	elif feed_data:
		posts = mochi.db.query("select * from posts where feed=? order by created desc limit 1", feed_data["id"])
		mochi.log.debug("\n    2. (%v) posts='%v'", len(posts), posts)
	else:
		posts = mochi.db.query("select * from posts order by created desc")
		mochi.log.debug("\n    3. (%v) posts='%v'", len(posts), posts)
	
	for i in range(len(posts)):
		mochi.log.debug("\n    i='%v', posts[i]='%v'", i, posts[i])
		feed_row = mochi.db.row("select name from feeds where id=?", posts[i]["feed"])
		mochi.log.debug("\n    posts[i]='%v'\n    feed_row='%v'", posts[i], feed_row)
		if feed_row:
			posts[i]["feed_fingerprint"] = mochi.entity.fingerprint(posts[i]["feed"])
			posts[i]["feed_name"] = feed_row["name"]
		
		posts[i]["body_markdown"] = mochi.markdown.render(posts[i]["body"]) # WIP
		posts[i]["created_string"] = mochi.time.local(posts[i]["created"])
		posts[i]["attachments"] = mochi.attachment.get("") # WIP

		my_reaction = mochi.db.row("select reaction from reactions where post=? and subscriber=?", posts[i]["id"], user_id)

		posts[i]["reactions"] = mochi.db.query("select * from reactions where post=? and subscriber!=? and reaction!='' order by name", posts[i]["id"], user_id)
		
		posts[i]["comments"] = feed_comments(user_id, posts[i], None, 0)

	is_owner = is_feed_owner(user_id, feed_data)

	feeds = mochi.db.query("select * from feeds order by updated desc")

	mochi.log.debug("\n    posts (%v)='%v'\n    feeds (%v)='%v'\n    is_owner='%v'\n    feed_data='%v'", len(posts), posts, len(feeds), feeds, is_owner, feed_data)

	a.template("view", {
		"feed": feed_data,
		"posts": posts,
		"feeds": feeds,
		"owner": is_owner,
		"user": user_id
	})

# Create a new feed
def action_create(a): # feeds_create
	if not a.user.identity.id:
		a.error(401, "Not logged in")
		return

	name = a.input("name")
	if not mochi.valid(name, "name"):
		a.error(400, "Invalid name")
		return
	
	privacy = a.input("privacy")
	if not mochi.valid(privacy, "privacy"):
		a.error(400, "Invalid privacy")
		return
	
	ent_id = mochi.entity.create("feed", name, privacy) # WIP Needs an error check, does it return None on failure?
	ent_fp = mochi.entity.fingerprint(ent_id)
	mochi.log.debug("\n entity='%v', finger='%v'", ent_id, ent_fp)
	mochi.db.query("replace into feeds ( id, fingerprint, name, subscribers, updated ) values ( ?, ?, ?, 1, ? )", ent_id, ent_fp, name, mochi.time.now())
	mochi.db.query("replace into subscribers ( feed, id, name ) values ( ?, ?, ? )", ent_id, a.user.identity.id, a.user.identity.name)

	a.template("create", ent_fp)

def action_find(a): # feeds_find
	a.template("find")

def action_search(a): # feeds_search
	if not a.user.identity.id:
		a.error(401, "Not logged in")
		return

	search = a.input("search")
	if not search:
		a.error(400, "No search entered")
		return

	mochi.log.debug("\n search='%v'", mochi.directory.search("feed", search, False))
	a.template("search", mochi.directory.search("feed", search, False))

# Get new feed data.
def action_new(a): # feeds_new
	name = "" if mochi.db.exists("select * from feeds limit 1") else a.user.identity.name

	a.template("new", {
		"name": name
	})

# Get new post data.
def action_post_new(a): # feeds_post_new
	if not a.user.identity.id:
		a.error(401, "Not logged in")
		return

	feeds = mochi.db.query("select * from feeds order by name")
	if len(feeds) == 0:
		a.error(500, "You do not own any feeds")
	
	a.template("post/new", {
		"feeds": feeds,
		"current": a.input("current")
	})

# New post. Only posts by the owner are supported for now.
def action_post_create(a): # feeds_post_create
	a.dump()
	mochi.log.debug("\n    feed_id='%v'", a.input("feed"))
	
	if not a.user.identity.id:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id
	
	feed_data = feed_by_id(user_id, a.input("feed"))
	if not feed_data:
		a.error(404, "Feed not found")
		return
	feed_id = feed_data["id"]
	
	if not is_feed_owner(user_id, feed_data):
		a.error(403, "Not feed owner")
		return # Original code does not return, why not?
	
	body = a.input("body")
	if not mochi.valid(body, "text"):
		a.error(400, "Invalid body")
		return
	
	post_uid = mochi.uid()
	if mochi.db.exists("select id from posts where id=?", post_uid):
		a.error(500, "Duplicate ID")
		return

	now = mochi.time.now()
	mochi.db.query("replace into posts ( id, feed, body, created, updated ) values ( ?, ?, ?, ?, ? )", post_uid, feed_id, body, now, now)
	set_feed_updated(feed_id)

	# If the request includes file uploads (multipart/form-data), attachments can be handled here.
	# Current UI sends text only; skip upload to avoid errors when not multipart.
	attachments = [] # WIP
	# a.websocket.write(chat["key"], {"created_local": mochi.time.local(mochi.time.now()), "name": a.user.identity.name, "body": body, "attachments": attachments})

	feed_subs = mochi.db.query("select * from subscribers where feed=? and id!=?", feed_id, user_id)
	for sub in feed_subs:
		mochi.message.send(
			headers(feed_id, sub["id"], "post/create"),
			{"id": post_uid, "created": now, "body": body, "attachments": attachments}
		)

	a.template("post/create", {
		"feed": feed_data,
		"post": post_uid
	})

def action_subscribe(a): # feeds_subscribe
	mochi.log.debug("\n    1feed_id='%v'", a.input("feed"))
	a.dump()

	if not a.user.identity.id:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id
	
	feed_id = a.input("feed")
	mochi.log.debug("\n    2feed_id='%v'", feed_id)
	if not mochi.valid(feed_id, "entity"):
		a.error(400, "Invalid ID")
		return
	
	directory = mochi.directory.get(feed_id)
	
	if directory == None or len(directory) == 0:
		a.error(404, "Unable to find feed in directory")
		return
	
	feed_fingerprint = mochi.entity.fingerprint(feed_id)
	mochi.db.query("replace into feeds ( id, fingerprint, name, subscribers, updated ) values ( ?, ?, ?, 1, ? )", feed_id, feed_fingerprint, directory["name"], mochi.time.now())

	mochi.message.send(headers(user_id, feed_id, "subscribe"), {"name": a.user.identity.name})

	a.template("subscribe", {
		"fingerprint": feed_fingerprint
	})

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

	mochi.log.debug("\n    feed_id='%v'\n    feed_data='%v'", feed_id, feed_data)

	if feed_data["entity"]:
		a.error(400, "You own this feed")
		return

	# if not feed_data["entity"]:
	if not is_feed_owner(user_id, feed_data):
		mochi.log.debug("\n    UNSUBBING '%v' from '%v', entity='%v'", user_id, feed_id, feed_data["entity"])

		mochi.db.query("delete from reactions where feed=?", feed_id)
		mochi.db.query("delete from comments where feed=?", feed_id)
		mochi.db.query("delete from posts where feed=?", feed_id)
		mochi.db.query("delete from subscribers where feed=?", feed_id)
		mochi.db.query("delete from feeds where id=?", feed_id)

		mochi.message.send(headers(user_id, feed_id, "unsubscribe"))

	a.template("unsubscribe")

def action_comment_new(a): # feeds_comment_new
	if not a.user.identity.id:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id

	a.template("comment/new", {
		"feed": feed_by_id(user_id, a.input("feed")),
		"post": a.input("post"),
		"parent": a.input("parent") # Doesn't exist, maybe for commenting on comment?
	})

def action_comment_create(a): # feeds_comment_create
	if not a.user.identity.id:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id

	feed_data = feed_by_id(user_id, a.input("feed"))
	if not feed_data:
		a.error(404, "Feed not found")
		return
	feed_id = feed_data["id"]

	post_id = a.input("post")
	if not mochi.db.exists("select id from posts where id=? and feed=?", post_id, feed_id):
		a.error(404, "Post not found")
		return
	
	parent_id = a.input("parent")
	if parent_id != "" and not mochi.db.exists("select id from comments where id=? and post=?", parent_id, post_id):
		a.error(404, "Parent not found")
		return
	
	body = a.input("body")
	if not mochi.valid(body, "text"):
		a.error(400, "Invalid body")
		return
	
	uid = mochi.uid()
	if mochi.db.exists("select id from comments where id=?", uid):
		a.error(500, "Duplicate ID")
		return
	
	now = mochi.time.now()
	mochi.db.query("replace into comments ( id, feed, post, parent, subscriber, name, body, created ) values ( ?, ?, ?, ?, ?, ?, ?, ? )", uid, feed_id, post_id, parent_id, user_id, a.user.identity.name, body, now)
	set_post_updated(post_id)
	set_feed_updated(feed_id)

	if is_feed_owner(user_id, feed_data):
		# We are the feed owner, send to other subscribers
		subs = mochi.db.query("select * from subscribers where feed=?", feed_id)
		for s in subs:
			if s["id"] == user_id:
				continue
			mochi.message.send(
				headers(feed_id, s["id"], "comment/create"),
				{"id": uid, "post": post_id, "parent": parent_id, "created": now, "subscriber": user_id, "name": a.user.identity.name, "body": body}
			)
	else:
		# We are not feed owner, send to owner
		mochi.message.send(
			headers(user_id, feed_id, "comment/submit"),
			{"id": uid, "post": post_id, "parent": parent_id, "body": body}
		)

	a.template("comment/create", {
		"feed": feed_data,
		"post": post_id
	})

def action_post_react(a): # feeds_post_react
	if not a.user.identity.id:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id

	post_data = mochi.db.row("select * from posts where id=?", a.input("post"))
	if not post_data:
		a.error(404, "Post not found")
		return
	post_id = post_data["id"]

	feed_data = feed_by_id(user_id, post_data["feed"])
	if not feed_data:
		a.error(404, "Feed not found")
		return
	feed_id = feed_data["id"]

	mochi.log.debug("\n   BBB")

	reaction = feeds_reaction_valid(a.input("reaction"))
	if not reaction:
		a.error(400, "Invalid reaction")
		return


	mochi.log.debug("\n   CCC")

	feeds_post_reaction_set(post_data, user_id, a.user.identity.name, reaction)


	mochi.log.debug("\n   DDD")

	if is_feed_owner(user_id, feed_data):
		subs = mochi.db.query("select * from subscribers where feed=?", feed_id)

		mochi.log.debug("\n   EEE")

		for s in subs:
			if s["id"] == user_id:
				continue
			mochi.message.send(
				headers(feed_id, s["id"], "post/react"),
				{"feed": feed_id, "post": post_id, "subscriber": user_id, "name": a.user.identity.name, "reaction": reaction}
			)
	else:

		mochi.log.debug("\n   FFF")

		mochi.message.send(
			headers(user_id, feed_id, "post/react"),
			{"post": post_id, "name": a.user.identity.name, "reaction": reaction}
		)


	mochi.log.debug("\n   GGG")

	a.template("post/react", {"feed": feed_data, "id": post_id})

def action_comment_react(a): # feeds_comment_react
	if not a.user.identity.id:
		a.error(401, "Not logged in")
		return
	user_id = a.user.identity.id

	comment_data = mochi.db.row("select * from comments where id=?", a.input("comment"))
	if not comment_data:
		a.error(404, "Comment not found")
		return
	comment_id = comment_data["id"]

	feed_data = feed_by_id(user_id, comment_data["feed"])
	if not feed_data:
		a.error(404, "Feed not found")
		return
	feed_id = feed_data["id"]

	reaction = feeds_reaction_valid(a.input("reaction"))
	if not reaction:
		a.error(400, "Invalid reaction to post '%s'", comment_id)
		return

	feeds_comment_reaction_set(comment_data, user_id, a.user.identity.name, reaction)

	if is_feed_owner(user_id, feed_data):
		subs = mochi.db.query("select * from subscribers where feed=?", feed_id)
		for s in subs:
			if s["id"] == user_id:
				continue
			mochi.message.send(
				headers(feed_id, s["id"], "comment/react"),
				{"feed": feed_id, "post": comment_data["post"], "comment": comment_id, "subscriber": user_id, "name": a.user.identity.name, "reaction": reaction}
			)
	else:
		mochi.message.send(
			headers(user_id, feed_id, "comment/react"),
			{"comment": comment_id, "name": a.user.identity.name, "reaction": reaction}
		)

	a.template("comment/react", {"feed": feed_data, "post": comment_data["post"]})

# EVENTS

def event_comment_create(e): # feeds_comment_create_event
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		mochi.log.info("Feed dropping post to unknown feed")
		return
	feed_id = feed_data["id"]
		
	comment = {"id": e.content("id"), "post": e.content("post"), "parent": e.content("parent"), "created": e.content("created"), "subscriber": e.content("subscriber"), "name": e.content("name"), "body": e.content("body")}

	if not mochi.valid(comment["id"], "id"):
		mochi.log.info("Feed dropping comment with invalid ID '%s'", comment["id"])
		return

	if mochi.db.exists("select id from comment where id=?", comment["id"]):
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

	mochi.db.query("replace into comments ( id, feed, post, parent, subscriber, name, body, created ) values ( ?, ?, ?, ?, ?, ?, ?, ? )", comment["id"], feed_id, comment["post"], comment["parent"], comment["subscriber"], comment["name"], comment["body"], comment["created"])
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

	if mochi.db.exists("select id from comment where id=?", comment["id"]):
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
	
	mochi.db.query("replace into comments ( id, feed, post, parent, subscriber, name, body, created ) values ( ?, ?, ?, ?, ?, ?, ?, ? )", comment["id"], feed_id, comment["post"], comment["parent"], comment["subscriber"], comment["name"], comment["body"], now)
	set_post_updated(comment["post"])
	set_feed_updated(feed_id)
	
	subs = mochi.db.query("select * from subscribers where feed=?", feed_id)
	for s in subs:
		if s["id"] == e.headers("from") or s["id"] == user_id:
			continue
		mochi.message.send(headers(feed_id, s["id"], "comment/create"), comment)

def event_comment_reaction(e): # feeds_comment_reaction_event
	user_id = e.user.identity.id
	if not mochi.valid(e.content("name"), "name"):
		mochi.log.info("Feed dropping comment reaction with invalid name '%s'", )
		return
	
	comment_data = mochi.db.query("select * from comments where id=?", e.content("comment"))
	if not comment_data:
		mochi.log.info("Feed dropping comment reaction for unknown comment")
		return
	comment_id = comment_data["id"]

	feed_data = feed_by_id(user_id, comment_data["feed"])
	if not feed_data:
		mochi.log.info("Feed dropping comment reaction for unknown feed")
		return
	feed_id = feed_data["id"]

	reaction = feeds_reaction_valid(e.content("reaction"))
	if not reaction:
		mochi.log.info("Feed dropping invalid comment reaction")
		return
	
	if is_feed_owner(user_id, feed_data):
		if e.header("from") != comment_data["feed"]:
			mochi.log.info("Feed dropping comment reaction from unknown owner")
			return
		feeds_comment_reaction_set(comment_data, e.content("subscriber"), e.content("name"), reaction)
	else:
		sub_data = get_feed_subscriber(feed_data, e.header("from"))
		if not sub_data:
			mochi.info("Feed dropping comment reaction from unknown subscriber '%s'", e.header("from"))
			return

		feeds_comment_reaction_set(comment_data, e.header("from"), e.content("name"), reaction)

		subs = mochi.db.query("select* from subscribers where feed=?", feed_id)
		for s in subs:
			if s["id"] == e.header("from") or s["id"] == user_id:
				continue
			mochi.message.send(
				headers(feed_id, s["id"], "comment/react"),
				{"feed": feed_id, "post": comment_data["post"], "comment": comment_id, "subscriber": e.header("from"), "name": e.content("name"), "reaction": reaction}
			)

def event_post_create(e): # feeds_post_create_event
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.header("from"))
	if not feed_data:
		mochi.log.info("Feed dropping post to unknown feed")
		return
	
	post = {"id": e.content("id"), "created": e.content("created"), "body": e.content("body"), "attachments": e.content("attachments")}

	if not mochi.valid(post["id"], "id"):
		mochi.log.info("Feed dropping post with invalid ID '%s'", post["id"])
		return

	if mochi.db.exists("select id from posts where id=?", post["id"]):
		mochi.log.info("Feed dropping post with duplicate ID '%s'", post["id"])
		return

	if not mochi.valid(post["body"], "text"):
		mochi.log.info("Feed dropping post with invalid body '%s'", post["body"])
		return
	
	mochi.db.query("replace into posts ( id, feed, body, created, updated ) values ( ?, ?, ?, ?, ? )", post["id"], feed_data["id"], post["body"], post["created"], post["created"])
	mochi.attachment.save(post["attachments"], "feeds/" + post["id"], feed_data["id"])

	set_feed_updated(feed_data["id"])
	return

def event_post_reaction(e): # feeds_post_reaction_event
	user_id = e.user.identity.id
	if not mochi.valid(e.content("name"), "name"):
		mochi.log.info("Feed dropping post reaction with invalid name '%s'", )
		return
	
	post_data = mochi.db.query("select * from post where id=?", e.content("post"))
	if not post_data:
		mochi.log.info("Feed dropping post reaction for unknown comment")
		return
	post_id = post_data["id"]

	feed_data = feed_by_id(user_id, post_data["feed"])
	if not feed_data:
		mochi.log.info("Feed dropping post reaction for unknown feed")
		return
	feed_id = feed_data["id"]

	reaction = feeds_reaction_valid(e.content("reaction"))
	if not reaction:
		mochi.log.info("Feed dropping invalid post reaction")
		return
	
	if is_feed_owner(user_id, feed_data):
		if e.header("from") != post_data["feed"]:
			mochi.log.info("Feed dropping post reaction from unknown owner")
			return
		feeds_post_reaction_set(post_data, e.content("subscriber"), e.content("name"), reaction)
	else:
		sub_data = get_feed_subscriber(feed_data, e.header("from"))
		if not sub_data:
			mochi.info("Feed dropping post reaction from unknown subscriber '%s'", e.header("from"))
			return

		feeds_post_reaction_set(post_data, e.header("from"), e.content("name"), reaction)

		subs = mochi.db.query("select* from subscribers where feed=?", feed_id)
		for s in subs:
			if s["id"] == e.header("from") or s["id"] == user_id:
				continue
			mochi.message.send(
				headers(feed_id, s["id"], "post/react"),
				{"feed": feed_id, "post": post_data["post"], "subscriber": e.header("from"), "name": e.content("name"), "reaction": reaction}
			)
	pass

def event_subscribe(e): # feeds_subscribe_event
	mochi.log.debug("\n    AAA")
	mochi.log.info("\n    BBB")
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.content("feed"))
	if not feed_data:
		return
	
	name = e.content("name")
	if not mochi.valid(name, "line"):
		mochi.log.debug("Feeds dropping subscribe with invalid name '%s'", name)
		return

	mochi.db.query("insert or ignore into subscribers (feed, id, name ) values ( ?, ?, ? )", feed_data["id"], e.content("from"), name)
	mochi.db.query("update feeds set subscribers=(select count(*) from subscribers where feed=?), updated=? where id=?", feed_data["id"], mochi.time.now(), feed_data["id"])
	
	feed_update(user_id, feed_data)
	feed_send_recent_posts(user_id, feed_data, e.content("from"))
	return

def event_unsubscribe(e): # feeds_unsubscribe_event
	mochi.log.debug("\n    CCC")
	mochi.log.info("\n    DDD")
	user_id = e.user.identity.id
	feed_data = feed_by_id(user_id, e.content("feed"))
	if not feed_data:
		return
	
	mochi.db.query("delete from subscribers where feed=? and id=?", e.header("to"), e.header("from"))
	feed_update(user_id, feed_data)
	return

def event_update(e): # feeds_update_event
	feed_data = feed_by_id(e.content("feed"))
	if not feed_data:
		return
	
	subscribers = e.content("subscribers", "0")
	if not mochi.valid(subscribers, "natural"):
		mochi.log.info("Feed dropping update with invalid number of subscribers '%s'", subscribers)
		return
	
	mochi.db.query("update feeds set subscribers=?, updated=? where id=?", subscribers, mochi.time.now(), feed_data["id"])
	return
