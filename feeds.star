# Mochi Feeds app

#load("db.star", "database_create")

def feed_by_id(user_id, feed_id):
	feeds = mochi.db.query("select * from feeds where id=?", feed_id)
	if len(feeds) == 0:
		feeds = mochi.db.query("select * from feeds where fingerprint=?", feed_id)
		if len(feeds) == 0:
			return None
	
	feed_data = feeds[0]
	mochi.debug.log("\n        1 feed_data='%v'", feed_data)

	if user_id != None:
		feed_data["entity"] = mochi.entity.get(feed_data.get("id"))
	
	mochi.debug.log("\n        2 feed_data='%v'", feed_data)
	return feed_data

def feed_comments(owner_id, user_id, post_row, parent_id, depth):
	if (depth > 1000):
		return None
	
	if parent_id == None:
		parent_id = ""

	if owner_id == None:
		owner_id = ""

	comments = mochi.db.query("select * from comments where post=? and parent=? order by created desc", post_row["id"], parent_id)
	for i, row in comments:
		comments[i]["FeedFingerprint"] = mochi.entity.fingerprint(row["feed"])
		comments[i]["BodyMarkdown"] = mochi.markdown.render(row["body"]) # WIP
		comments[i]["CreatedString"] = mochi.time.local(owner_id, row["created"])
		comments[i]["User"] = owner_id or ""

		my_reaction = mochi.db.row("select reaction from reactions where comment=? and subscriber=?", row["id"], user_id)

		comments[i]["Reactions"] = mochi.db.query("select * from reactions where comment=? and subscriber!=? and reaction!='' order by name", row["id"], user_id)
		
		comments[i]["Children"] = feed_comments(owner_id, user_id, row, None, depth + 1)
	
	mochi.log.debug("\n Comments depth=%v, entries:%v,  '%v'", depth, len(comments), comments)
	return comments


# Create database
def database_create():
	mochi.db.query("create table settings ( name text not null primary key, value text not null )")
	mochi.db.query("replace into settings ( name, value ) values ( 'schema', 1 )")

	mochi.db.query("create table feeds ( id text not null primary key, fingerprint text not null, name text not null, privacy text not null default 'public', owner integer not null default 0, subscribers integer not null default 0, updated integer not null )")
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
	return 1

# ACTIONS

def action_view(action, inputs):
	mochi.log.debug("\n action='%v'", action)
	mochi.log.debug("\n inputs='%v'", inputs)

	feed_id = inputs.get("feed")
	user_id = action.get("identity.id")
	owner_id = user_id # action.get("owner") # Exists in GO, not in SL, maybe WIP?

	mochi.log.debug("\n    FEED='%v' <%v>, owner_id='%v', user_id='%v'", feed_id, type(feed_id), owner_id, user_id)
	if type(feed_id) == type("") and mochi.valid(feed_id, "id"):
		mochi.log.debug("\n    Feed='%v'", feed_id)
	else:
		mochi.log.debug("\n    No feed_id specified.")
	
	feed_data = None
	if type(feed_id) == type("") and mochi.valid(feed_id, "id"):
		feed_data = feed_by_id(owner_id, feed_id)

	mochi.log.debug("\n    feed_data='%v'", feed_data)

	if user_id == None and feed_data == None:
		mochi.action.error(404, "No feed specified")
		mochi.log.debug("\n    No feed specified")
		return

	post_id = inputs.get("post")
	posts = None
	
	if post_id:
		posts = mochi.db.query("select * from posts where id=?", post_id)
	elif feed_data:
		posts = mochi.db.query("select * from posts where feed=? order by created desc limit 1", feed_data["id"])
	else:
		posts = mochi.db.query("select * from posts order by created desc")
	
	for i, row in posts:
		feed_row = mochi.db.row("select name from feeds where id=?", row["feed"])
		mochi.log.debug("    row='%v'\n    feed_row='%v'", row, feed_row)
		if feed_row:
			posts[i]["FeedFingerprint"] = mochi.entity.fingerprint(row["feed"])
			posts[i]["FeedName"] = feed_row["name"]
		
		posts[i]["BodyMarkdown"] = mochi.markdown.render(row["body"]) # WIP
		posts[i]["CreatedString"] = mochi.time.local(owner_id, row["created"])
		posts[i]["Attachments"] = mochi.attachment.get(owner_id, "") # WIP

		my_reaction = mochi.db.row("select reaction from reactions where post=? and subscriber=?", row["id"], user_id)

		posts[i]["Reactions"] = mochi.db.query("select * from reactions where post=? and subscriber!=? and reaction!='' order by name", row["id"], user_id)
		
		posts[i]["Comments"] = feed_comments(owner_id, user_id, row, None, 0)

	owner = mochi.db.exists("select id from feeds where owner=1 limit 1")

	feeds = mochi.db.query("select * from feeds order by updated desc")

	mochi.log.debug("\n    posts (%v)='%v'\n    feeds (%v)='%v'", len(posts), posts, len(feeds), feeds)

	mochi.action.write("view", action["format"], {
		"Feed": feed_data,
		"Posts": posts,
		"Feeds": feeds,
		"Owner": owner,
		"User": user_id
	})
	return

# Create a new feed
def action_create(action, inputs):
	mochi.log.debug("\n action='%v'", action)
	mochi.log.debug("\n inputs='%v'", inputs)
	
	if not action.get("identity.id"):
		mochi.action.error(401, "Not logged in")
		return

	name = inputs.get("name")
	if not mochi.valid(name, "name"):
		mochi.action.error(400, "Invalid name")
		return
	
	privacy = inputs.get("privacy")
	if not mochi.valid(privacy, "^(public|private)$"):
		mochi.action.error(400, "Invalid privacy")
		return
	
	ent_id = mochi.entity.create("feeds", name, privacy) # WIP Needs an error check, does it return None on failure?
	ent_fp = mochi.entity.fingerprint(ent_id)
	mochi.log.debug("\n entity='%v', finger='%v'", ent_id, ent_fp)
	mochi.db.query("replace into feeds ( id, fingerprint, name, owner, subscribers, updated ) values ( ?, ?, ?, 1, 1, ? )", ent_id, ent_fp, name, mochi.time.now())
	mochi.db.query("replace into subscribers ( feed, id, name ) values ( ?, ?, ? )", ent_id, action.get("identity.id"), action.get("identity.name"))

	mochi.action.write("create", action["format"], ent_fp)

	return

def action_find(action, inputs):
	return 1

# Get new feed data.
def action_new(action, inputs):
	name = "" if mochi.db.exists("select * from feeds where owner=1 limit 1") else action.get("identity.name")

	mochi.action.write("new", action["format"], {
		"Name": name
	})
	return

# New post. Only posts by the owner are supported for now.
def action_post_create(action, inputs):
	return 1

def action_post_new(action, inputs):
	return 1

def action_search(action, inputs):
	return 1

def action_subscribe(action, inputs):
	return 1

def action_unsubscribe(action, inputs):
	return 1

def action_comment_new(action, inputs):
	return 1

def action_comment_create(action, inputs):
	return 1

def action_post_react(action, inputs):
	return 1

def action_comment_react(action, inputs):
	return 1

# EVENTS

def event_comment_create_event(event, content):
	return 1

def event_comment_submit_event(event, content):
	return 1

def event_comment_reaction_event(event, content):
	return 1

def event_post_create_event(event, content):
	return 1

def event_post_reaction_event(event, content):
	return 1

def event_subscribe_event(event, content):
	return 1

def event_unsubscribe_event(event, content):
	return 1

def event_update_event(event, content):
	return 1
