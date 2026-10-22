# Copyright © 2026 Mochisoft OÜ
# SPDX-License-Identifier: AGPL-3.0-only
# This file is part of Mochi, licensed under the GNU AGPL v3 with the
# Mochi Application Interface Exception - see license.txt and license-exception.md.

# === Mastodon apps (the federation plan, phase 28) ===
#
# Core's Mastodon interface reads and writes as a hosted fediverse account
# through these functions: the posts of the feeds the user follows as the
# home timeline, a feed as a list, posting, editing and deleting in the
# account's home feed and commenting where a post replies (decision 42),
# reactions as favourites, saved posts as bookmarks, boosts, poll votes,
# follows as sources of the home feed, and what notifications are. Each
# answers what the interface renders, or {"error": text} in the user's
# language. Every function takes the account and its home feed, which core
# names.

MASTODON_REACTION = "like"

def mastodon_identity():
	"""The user's person entity, as the functions act for it."""
	identity = service_identity()
	if not identity:
		return None
	return {"id": identity["id"], "name": identity.get("name", "")}

def mastodon_failure(failure):
	"""A helper's refusal as the interface answers it."""
	return {"error": mochi.app.label(failure[1])}

def mastodon_home(home):
	"""The home feed posts made from the app land in: (feed, None), or
	(None, refusal) where it is gone or private (decision 42)."""
	feed = mochi.db.row("select * from feeds where id=?", home) if home else None
	if not feed or not owned(feed["id"]):
		return None, {"error": mochi.app.label("errors.home_feed_missing")}
	if feed.get("privacy", "public") != "public":
		return None, {"error": mochi.app.label("errors.home_feed_private")}
	return feed, None

def mastodon_attachment(feed_id, att):
	"""An attachment as the interface shows it: by its public address here."""
	document = fediverse_attachment(feed_id, att)
	if not document:
		return None
	preview = document["url"]
	if attachment_kind(att) == "image":
		variant = fediverse_attachment(feed_id, att, "preview")
		if variant:
			preview = variant["url"]
	return {"id": att["id"], "name": att.get("name", ""), "type": att.get("type", "") or mochi.file.type(att.get("name", "")), "size": att.get("size", 0), "url": document["url"], "preview": preview, "description": att.get("description", ""), "caption": att.get("caption", ""), "created": att.get("created", 0)}

def mastodon_places(items):
	return ", ".join(["?" for _ in items])

def mastodon_posts(rows, user_id):
	"""Posts as the interface reads them: each with its feed, its counts,
	the user's reaction, whether they saved it, its copies, its source, its
	tags and its attachments."""
	if not rows:
		return []
	ids = [p["id"] for p in rows]
	places = mastodon_places(ids)
	feeds = {}
	feed_ids = {}
	for p in rows:
		feed_ids[p["feed"]] = True
	for row in mochi.db.rows("select id, name, fingerprint, privacy from feeds where id in (" + mastodon_places(feed_ids) + ")", *feed_ids.keys()) or []:
		feeds[row["id"]] = row
	comments = {r["post"]: r["n"] for r in mochi.db.rows("select post, count(*) as n from comments where post in (" + places + ") group by post", *ids) or []}
	likes = {r["post"]: r["n"] for r in mochi.db.rows("select post, count(*) as n from reactions where comment='' and reaction!='' and post in (" + places + ") group by post", *ids) or []}
	mine = {}
	if user_id:
		mine = {r["post"]: r["reaction"] for r in mochi.db.rows("select post, reaction from reactions where comment='' and reaction!='' and subscriber=? and post in (" + places + ")", user_id, *ids) or []}
	saved = {}
	if user_id:
		saved = {r["post"]: True for r in mochi.db.rows("select post from saved where user=? and post in (" + places + ")", user_id, *ids) or []}
	sources = {r["post"]: r for r in mochi.db.rows("select sp.post, s.name, s.url, s.type from source_posts sp join sources s on sp.source = s.id where sp.post in (" + places + ")", *ids) or []}
	tags = {}
	for r in mochi.db.rows("select object, label from tags where object in (" + places + ")", *ids) or []:
		tags.setdefault(r["object"], []).append({"label": r["label"]})
	copies = copies_by_posts(ids)
	owned_feeds = owned_set()
	out = []
	for p in rows:
		feed = feeds.get(p["feed"]) or {}
		data = json.decode(p.get("data", "") or "{}", None)
		if type(data) != "dict":
			data = {}
		attachments = []
		for att in post_attachments(p["id"], p["feed"]):
			shown = mastodon_attachment(p["feed"], att)
			if shown:
				attachments.append(shown)
		poll = data.get("poll")
		if type(poll) == "dict" and user_id:
			voted = [r["option"] for r in mochi.db.rows("select option from votes where post=? and voter=?", p["id"], user_id) or []]
			poll = dict(poll)
			poll["voted"] = len(voted) > 0
			poll["own"] = voted
			data = dict(data)
			data["poll"] = poll
		source = sources.get(p["id"])
		out.append({
			"id": p["id"], "feed": p["feed"], "feed_name": feed.get("name", ""), "fingerprint": feed.get("fingerprint", ""),
			"owned": p["feed"] in owned_feeds and bool(user_id) and p.get("author") == user_id and not source,
			"created": p["created"], "edited": p.get("edited", 0), "body": p["body"], "format": p.get("format", "markdown"),
			"data": data, "author": p.get("author", ""), "remote": p.get("remote", ""),
			"visibility": p.get("visibility") or "public", "warning": p.get("warning") or "", "sensitive": bool(p.get("sensitive")),
			"language": p.get("language") or "", "pinned": number(p.get("pinned", 0)),
			"link": post_link(p["feed"], p["id"]), "attachments": attachments,
			"comments": comments.get(p["id"], 0), "likes": likes.get(p["id"], 0), "boosts": number(p.get("boosts", 0)),
			"reaction": mine.get(p["id"], ""), "saved": saved.get(p["id"], False),
			"copies": copies.get(p["id"], []), "tags": tags.get(p["id"], []),
			"source": {"name": source["name"], "url": source["url"], "type": source["type"]} if source and source["type"] != "person/posts" else None,
		})
	return out

def mastodon_comments(rows, post, user_id):
	"""Comments as the interface reads them, each with the post it is on."""
	if not rows:
		return []
	ids = [c["id"] for c in rows]
	places = mastodon_places(ids)
	likes = {r["comment"]: r["n"] for r in mochi.db.rows("select comment, count(*) as n from reactions where reaction!='' and comment in (" + places + ") group by comment", *ids) or []}
	mine = {}
	if user_id:
		mine = {r["comment"]: r["reaction"] for r in mochi.db.rows("select comment, reaction from reactions where reaction!='' and subscriber=? and comment in (" + places + ")", user_id, *ids) or []}
	replies = {r["parent"]: r["n"] for r in mochi.db.rows("select parent, count(*) as n from comments where parent in (" + places + ") group by parent", *ids) or []}
	attachments = attachment_list_many(ids, post["feed"])
	out = []
	for c in rows:
		shown = []
		for att in attachments.get(c["id"], []):
			a = mastodon_attachment(post["feed"], att)
			if a:
				shown.append(a)
		out.append({
			"id": c["id"], "post": post, "parent": c.get("parent", ""), "subscriber": c["subscriber"], "name": c.get("name", ""),
			"body": c["body"], "format": c.get("format", "text"), "created": c["created"], "edited": c.get("edited", 0),
			"remote": c.get("remote", ""), "mine": bool(user_id) and c["subscriber"] == user_id,
			"reaction": mine.get(c["id"], ""), "likes": likes.get(c["id"], 0), "replies": replies.get(c["id"], 0),
			"attachments": shown,
		})
	return out

def mastodon_post_of(post_id, user_id):
	"""One post as the interface reads it, or None."""
	rows = mochi.db.rows("select * from posts where id=?", post_id)
	posts = mastodon_posts(rows, user_id)
	return posts[0] if posts else None

def mastodon_comment_of(comment_id, user_id):
	"""One comment as the interface reads it, with its post, or None."""
	row = mochi.db.row("select * from comments where id=?", comment_id)
	if not row:
		return None
	post = mastodon_post_of(row["post"], user_id)
	if not post:
		return None
	comments = mastodon_comments([row], post, user_id)
	return comments[0] if comments else None

def mastodon_cursor(id):
	"""A post's place in a timeline: when it was made, and its id."""
	row = mochi.db.row("select created, id from posts where id=?", id) if id else None
	return row

def function_mastodon_posts(context, account, home, kind="home", feed="", tag="", before="", after="", oldest=False, limit=20, ids=None):
	"""A page of a timeline, newest first: the home timeline, the posts of
	every feed the user owns or follows; a list, one feed; a tag's posts;
	the posts the user favourited or saved; the account's own posts, pinned
	or all; or the posts asked for by id or by their id elsewhere."""
	identity = mastodon_identity()
	if not identity:
		return []
	user_id = identity["id"]
	limit = max(1, min(number(limit, 20), 40))
	joins = ""
	where = ""
	args = []
	if kind in ("ids", "remote"):
		wanted = [str(i) for i in (ids or []) if i][:40]
		if not wanted:
			return []
		column = "p.id" if kind == "ids" else "p.remote"
		rows = mochi.db.rows("select p.* from posts p inner join subscribers s on p.feed = s.feed where s.id=? and " + column + " in (" + mastodon_places(wanted) + ")", user_id, *wanted)
		return mastodon_posts(rows, user_id)
	if kind == "home":
		joins = " inner join subscribers s on p.feed = s.feed"
		where = " where s.id=?"
		args = [user_id]
	elif kind == "list":
		held = feed_by_id(user_id, feed)
		if not held or not (owned(held["id"]) or is_user_subscribed(user_id, held["id"])):
			return []
		where = " where p.feed=?"
		args = [held["id"]]
	elif kind == "tag":
		joins = " inner join subscribers s on p.feed = s.feed"
		where = " where s.id=? and exists (select 1 from tags t where t.object=p.id and lower(t.label)=?)"
		args = [user_id, str(tag).lower()]
	elif kind == "favourites":
		joins = " inner join reactions r on r.post = p.id and r.comment='' and r.reaction!=''"
		where = " where r.subscriber=?"
		args = [user_id]
	elif kind == "bookmarks":
		joins = " inner join saved v on v.post = p.id"
		where = " where v.user=?"
		args = [user_id]
	elif kind in ("own", "pinned"):
		joins = " inner join publish b on b.feed = p.feed"
		where = " where b.account=? and p.author=?" + (" and p.pinned>0" if kind == "pinned" else "")
		args = [account, user_id]
	else:
		return []
	where += filters_sql("p.", "p.feed")
	order = " order by p.created desc, p.id desc"
	cursor = mastodon_cursor(before)
	if cursor:
		where += " and (p.created<? or (p.created=? and p.id<?))"
		args += [cursor["created"], cursor["created"], cursor["id"]]
	cursor = mastodon_cursor(after)
	if cursor:
		where += " and (p.created>? or (p.created=? and p.id>?))"
		args += [cursor["created"], cursor["created"], cursor["id"]]
		if oldest:
			order = " order by p.created asc, p.id asc"
	rows = mochi.db.rows("select distinct p.* from posts p" + joins + where + order + " limit ?", *(args + [limit]))
	if oldest:
		rows = list(reversed(rows))
	return mastodon_posts(rows, user_id)

def function_mastodon_comments(context, account, home, post):
	"""A post's comments, oldest first, where the user may see the post."""
	identity = mastodon_identity()
	if not identity:
		return []
	shown = mastodon_post_of(post, identity["id"])
	if not shown or not check_access_user(identity["id"], shown["feed"], "view"):
		return []
	rows = mochi.db.rows("select * from comments where post=? order by created, id", post)
	return mastodon_comments(rows, shown, identity["id"])

def function_mastodon_comment(context, account, home, id):
	"""One comment, with its post, where the user may see the post."""
	identity = mastodon_identity()
	if not identity:
		return None
	comment = mastodon_comment_of(id, identity["id"])
	if not comment or not check_access_user(identity["id"], comment["post"]["feed"], "view"):
		return None
	return comment

def mastodon_media_save(media):
	"""What keeps a new post's or comment's files: each given with its bytes."""
	def save(object):
		saved = []
		for m in media or []:
			if type(m) != "dict" or not m.get("data"):
				continue
			att = attachment_create(object, str(m.get("name", "") or "file"), m["data"], str(m.get("type", "") or ""), "", text_cut(str(m.get("description", "") or ""), 1500))
			if att:
				saved.append(att)
		return saved
	return save

def mastodon_features(visibility, warning, sensitive, language):
	"""The features a status carries, as a post keeps them, or None for an
	invalid one."""
	features = {}
	if visibility:
		if visibility not in VISIBILITIES:
			return None
		features["visibility"] = visibility
	warning = (warning or "").strip()
	if warning and (not mochi.text.valid(warning, "line") or len(warning) > WARNING_MAXIMUM):
		return None
	features["warning"] = warning
	features["sensitive"] = 1 if sensitive else 0
	if language:
		if not valid_language(language):
			return None
		features["language"] = language.lower()
	return features

def mastodon_poll(poll):
	"""A status's poll as a post keeps one, or None for none, or False for an
	invalid one."""
	if not poll:
		return None
	options = [str(o) for o in (poll.get("options") or []) if str(o).strip()]
	made = sanitize_poll({"options": options, "multiple": poll.get("multiple")})
	if not made or len(made["options"]) < 2:
		return False
	duration = number(poll.get("duration", 0))
	if duration:
		if duration < POLL_DURATION_MINIMUM or duration > POLL_DURATION_MAXIMUM:
			return False
		made["expires"] = mochi.time.now() + duration
	for option in made["options"]:
		option["votes"] = 0
	made["voters"] = 0
	return made

def function_mastodon_create(context, account, home, text="", reply="", media=None, visibility="public", warning="", sensitive=False, language="", poll=None):
	"""Post a status: a comment on what it replies to, a post (by id) or a
	comment ("c:" and its id); else a post in the home feed, published
	through it."""
	identity = mastodon_identity()
	if not identity:
		return {"error": mochi.app.label("errors.identity_required")}
	text = text or ""
	if text and not mochi.text.valid(text, "text"):
		return {"error": mochi.app.label("errors.invalid_body")}
	save = mastodon_media_save(media)
	if reply:
		parent = ""
		if reply.startswith("c:"):
			comment = mochi.db.row("select * from comments where id=?", reply[2:])
			if not comment:
				return {"error": mochi.app.label("errors.comment_not_found")}
			post_id, feed_id, parent = comment["post"], comment["feed"], comment["id"]
		else:
			post = mochi.db.row("select * from posts where id=?", reply)
			if not post:
				return {"error": mochi.app.label("errors.post_not_found")}
			post_id, feed_id = post["id"], post["feed"]
		if not text.strip():
			return {"error": mochi.app.label("errors.invalid_body")}
		result, failure = comment_create(feed_id, post_id, parent, identity["id"], identity["name"], text, "", account, None, save)
		if failure:
			return mastodon_failure(failure)
		comment = mastodon_comment_of(result["id"], identity["id"])
		if not comment:
			return {"error": mochi.app.label("errors.comment_not_found")}
		return {"comment": comment}
	feed, refusal = mastodon_home(home)
	if refusal:
		return refusal
	features = mastodon_features(visibility, warning, sensitive, language)
	made = mastodon_poll(poll)
	if features == None or made == False:
		return {"error": mochi.app.label("errors.invalid_data")}
	data = {"poll": made} if made else None
	# The post goes out through the account the app is signed in to, beside
	# the feed's own accounts.
	accounts = publish_list(feed["id"])
	if account not in accounts:
		accounts = accounts + [account]
	post_id, attachments, failure = post_create(feed, identity["id"], identity["name"], text, data, features, accounts, save, "text")
	if failure:
		return mastodon_failure(failure)
	return {"post": mastodon_post_of(post_id, identity["id"])}

def function_mastodon_edit(context, account, home, id, text="", media=None, warning="", sensitive=False, language=""):
	"""Change a status the user posted: a post's text, features and, where
	given, its files; a comment's ("c:" and its id) text."""
	identity = mastodon_identity()
	if not identity:
		return {"error": mochi.app.label("errors.identity_required")}
	if not mochi.text.valid(text or "", "text"):
		return {"error": mochi.app.label("errors.invalid_body")}
	if id.startswith("c:"):
		comment = mochi.db.row("select * from comments where id=?", id[2:])
		if not comment:
			return {"error": mochi.app.label("errors.comment_not_found")}
		result, failure = comment_edit(comment["feed"], comment["id"], comment["post"], identity["id"], text)
		if failure:
			return mastodon_failure(failure)
		return {"comment": mastodon_comment_of(comment["id"], identity["id"])}
	post = mochi.db.row("select * from posts where id=?", id)
	if not post:
		return {"error": mochi.app.label("errors.post_not_found")}
	features = mastodon_features("", warning, sensitive, language)
	if features == None:
		return {"error": mochi.app.label("errors.invalid_data")}
	data = json.decode(post.get("data", "") or "{}", None)
	data = data if type(data) == "dict" and data else None

	def change(post_id, info):
		if media == None:
			return None
		for att in attachment_list(post_id, info["id"]):
			attachment_delete(att["id"])
		mastodon_media_save(media)(post_id)
		return None

	result, failure = post_edit(post["feed"], post["id"], identity["id"], text, data, features, change)
	if failure:
		return mastodon_failure(failure)
	mochi.db.execute("update posts set format='text' where id=? and format='markdown' and author=?", post["id"], identity["id"])
	return {"post": mastodon_post_of(post["id"], identity["id"])}

def function_mastodon_delete(context, account, home, id):
	"""Delete a status the user posted, or one in a feed they manage: a post
	by its id, a comment by "c:" and its id."""
	identity = mastodon_identity()
	if not identity:
		return {"error": mochi.app.label("errors.identity_required")}
	if id.startswith("c:"):
		comment = mochi.db.row("select * from comments where id=?", id[2:])
		if not comment:
			return {"error": mochi.app.label("errors.comment_not_found")}
		result, failure = comment_delete(comment["feed"], comment["id"], comment["post"], identity["id"])
	else:
		post = mochi.db.row("select * from posts where id=?", id)
		if not post:
			return {"error": mochi.app.label("errors.post_not_found")}
		result, failure = post_delete(post["feed"], post["id"], identity["id"])
	if failure:
		return mastodon_failure(failure)
	return {"deleted": True}

def function_mastodon_react(context, account, home, id, on=True):
	"""Favourite a status a feed holds, or take it back: the user's reaction
	to the post or the comment ("c:" and its id)."""
	identity = mastodon_identity()
	if not identity:
		return {"error": mochi.app.label("errors.identity_required")}
	reaction = MASTODON_REACTION if on else ""
	if id.startswith("c:"):
		comment = mochi.db.row("select * from comments where id=?", id[2:])
		if not comment:
			return {"error": mochi.app.label("errors.comment_not_found")}
		result, failure = comment_react(comment["feed"], comment["id"], identity["id"], identity["name"], reaction)
		if failure:
			return mastodon_failure(failure)
		return {"comment": mastodon_comment_of(comment["id"], identity["id"])}
	post = mochi.db.row("select * from posts where id=?", id)
	if not post:
		return {"error": mochi.app.label("errors.post_not_found")}
	result, failure = post_react(post["feed"], post["id"], identity["id"], identity["name"], reaction, "")
	if failure:
		return mastodon_failure(failure)
	return {"post": mastodon_post_of(post["id"], identity["id"])}

def function_mastodon_save(context, account, home, id, on=True):
	"""Bookmark a post, or take the bookmark back: the user's saved posts."""
	identity = mastodon_identity()
	if not identity:
		return {"error": mochi.app.label("errors.identity_required")}
	shown = mastodon_post_of(id, identity["id"])
	if not shown:
		return {"error": mochi.app.label("errors.post_not_found")}
	if on:
		saved_set(identity["id"], id, json.encode({"id": id, "feed": shown["feed"], "feed_name": shown["feed_name"], "feed_fingerprint": shown["fingerprint"], "body": shown["body"], "created": shown["created"]}))
	else:
		mochi.db.execute("delete from saved where user=? and post=?", identity["id"], id)
	return {"post": mastodon_post_of(id, identity["id"])}

def function_mastodon_boost(context, account, home, id="", remote="", on=True):
	"""Boost a status from another network, or take the boost back, from the
	account: one a feed holds by its id, else one elsewhere by its id there,
	taken into the home feed first so the boost has a post to belong to."""
	identity = mastodon_identity()
	if not identity:
		return {"error": mochi.app.label("errors.identity_required")}
	post = mochi.db.row("select * from posts where id=?", id) if id and not id.startswith("c:") else None
	if not post and remote:
		post = mochi.db.row("select * from posts where remote=?", remote)
	if not post:
		if not on or not remote:
			return {"error": mochi.app.label("errors.post_not_found")}
		note = mochi.account.object.read(account, remote)
		held = mastodon_hold(account, home, note)
		if held.get("error"):
			return held
		post = mochi.db.row("select * from posts where id=?", held["post"]["id"])
	feed = mochi.db.row("select * from feeds where id=?", post["feed"])
	if not feed or not is_feed_owner(identity["id"], feed):
		feed, refusal = mastodon_home(home)
		if refusal:
			return refusal
	if on:
		result, failure = post_boost(feed, post, account)
	else:
		result, failure = post_unboost(post, account)
	if failure:
		return mastodon_failure(failure)
	return {"post": mastodon_post_of(post["id"], identity["id"])}

def mastodon_hold(account, home, note):
	"""A Note from another server taken into the home feed as its author's
	post, so the user can reply to it, boost it or vote in it: the post it
	already is where a feed holds it."""
	if type(note) != "dict":
		return {"error": mochi.app.label("errors.post_not_found")}
	remote = object_id_of(note)
	if not remote:
		return {"error": mochi.app.label("errors.post_not_found")}
	identity = mastodon_identity()
	existing = mochi.db.row("select id from posts where remote=?", remote)
	if existing:
		return {"post": mastodon_post_of(existing["id"], identity["id"] if identity else "")}
	feed, refusal = mastodon_home(home)
	if refusal:
		return refusal
	acc = publish_account(account)
	if not acc:
		return {"error": mochi.app.label("errors.account_not_found")}
	reply = note.get("inReplyTo")
	if reply:
		# A reply is held as its author's post all the same: a comment needs
		# a post here to hang from, and the Note is that post.
		note = dict(note)
		note.pop("inReplyTo")
	item = fediverse_item(acc, note)
	if not item:
		return {"error": mochi.app.label("errors.not_from_network")}
	data = {"rss": {"title": "", "link": item["link"], "html": item["html"], "source": item["author"]}}
	for key in ["person", "boost", "media", "poll", "emoji"]:
		if item.get(key):
			data[key] = item[key]
	data = sanitize_post_data(data)
	body = "\n\n".join([p for p in [item["text"], item["link"]] if p])
	created = item["created"] or mochi.time.now()
	post_id = mochi.uid()
	mochi.db.execute("insert into posts (id, feed, body, data, format, created, updated, mmdd) values (?, ?, ?, ?, 'text', ?, ?, ?)",
		post_id, feed["id"], body, json.encode(data), created, created, compute_mmdd(created))
	features = {"author": item["actor"], "remote": item.get("remote", ""), "visibility": item.get("visibility") or "public", "warning": item.get("warning", ""), "sensitive": 1 if item.get("sensitive") else 0, "language": item.get("language", "")}
	clause, values = features_sql(features)
	mochi.db.execute("update posts set " + clause + " where id=?", *(values + [post_id]))
	mochi.db.commit.fire("posts", "insert", post_id)
	set_feed_updated(feed["id"])
	return {"post": mastodon_post_of(post_id, identity["id"] if identity else "")}

def function_mastodon_hold(context, account, home, note):
	"""Take a Note from another server into the home feed."""
	return mastodon_hold(account, home, note)

def function_mastodon_vote(context, account, home, id, choices=None):
	"""Vote in a post's poll, by the options' places."""
	identity = mastodon_identity()
	if not identity:
		return {"error": mochi.app.label("errors.identity_required")}
	post = mochi.db.row("select * from posts where id=?", id)
	if not post:
		return {"error": mochi.app.label("errors.post_not_found")}

	def choose(poll):
		options = []
		for value in choices or []:
			index = number(value, -1)
			if index < 0 or index >= len(poll["options"]) or index in options:
				return None
			options.append(index)
		if not options or (len(options) > 1 and not poll.get("multiple")):
			return None
		return options

	result, failure = poll_vote(post["feed"], post["id"], identity["id"], identity["name"], choose)
	if failure:
		return mastodon_failure(failure)
	return {"post": mastodon_post_of(post["id"], identity["id"])}

def function_mastodon_follow(context, account, home, address, on=True):
	"""Follow someone as the account, as a source of the home feed, or stop
	following them in every feed that follows them through it."""
	identity = mastodon_identity()
	if not identity:
		return {"error": mochi.app.label("errors.identity_required")}
	acc = publish_account(account)
	if not acc or not hosted_fediverse(acc):
		return {"error": mochi.app.label("errors.account_not_found")}
	if not on:
		sources = mochi.db.rows("select * from sources where type='person/posts' and account=? and url=?", account, address)
		for source in sources:
			feed = mochi.db.row("select * from feeds where id=?", source["feed"])
			if feed:
				source_remove(feed, source, identity["id"], False)
		if not sources:
			mochi.account.unfollow(account, address)
		return {"followed": False}
	feed, refusal = mastodon_home(home)
	if refusal:
		return refusal
	if mochi.db.exists("select 1 from sources where feed=? and type='person/posts' and url=?", feed["id"], address):
		return {"followed": True}
	found = lookup_person(address)
	if not found or found["kind"] == "post" or found["network"] != "fediverse" or not found.get("id"):
		return {"error": mochi.app.label("errors.person_not_found")}
	source, count = person_follow_create(feed, found, acc, found["name"], identity["id"])
	if not source:
		return {"error": mochi.app.label("errors.follow_not_sent")}
	return {"followed": True}

def function_mastodon_lists(context, account, home):
	"""The user's own feeds, as lists."""
	owned = owned_set()
	return [{"id": r["id"], "name": r["name"], "created": r.get("updated", 0)} for r in mochi.db.rows("select id, name, updated from feeds") if r["id"] in owned]

def function_mastodon_list(context, account, home, action, id="", name="", address=""):
	"""Make a list, a feed of the user's; rename one; list the people one
	follows; add someone to it or take them off. A feed is deleted in
	Feeds, not from an app, since it takes its posts with it."""
	identity = mastodon_identity()
	if not identity:
		return {"error": mochi.app.label("errors.identity_required")}
	if action == "create":
		made = function_create(context, name, "public")
		if not made:
			return {"error": mochi.app.label("errors.invalid_name")}
		return {"list": {"id": made["id"], "name": made["name"], "created": mochi.time.now()}}
	feed = mochi.db.row("select * from feeds where id=?", id)
	if not feed or not owned(feed["id"]):
		return {"error": mochi.app.label("errors.feed_not_found")}
	if action == "rename":
		if not name or not mochi.text.valid(name, "name"):
			return {"error": mochi.app.label("errors.invalid_name")}
		mochi.entity.update(feed["id"], name=name)
		mochi.db.execute("update feeds set name=? where id=?", name, feed["id"])
		broadcast_event(feed["id"], "update", {"name": name})
		return {"list": {"id": feed["id"], "name": name, "created": feed.get("updated", 0)}}
	if action == "delete":
		return {"error": mochi.app.label("errors.list_feed_delete")}
	if action == "accounts":
		return [r["url"] for r in mochi.db.rows("select url from sources where feed=? and type='person/posts' order by fetched", feed["id"])]
	if action == "add":
		if mochi.db.exists("select 1 from sources where feed=? and type='person/posts' and url=?", feed["id"], address):
			return {}
		acc = publish_account(account)
		found = lookup_person(address)
		if not acc or not found or found["kind"] == "post" or not found.get("id"):
			return {"error": mochi.app.label("errors.person_not_found")}
		source, count = person_follow_create(feed, found, acc, found["name"], identity["id"])
		if not source:
			return {"error": mochi.app.label("errors.follow_not_sent")}
		return {}
	if action == "remove":
		for source in mochi.db.rows("select * from sources where feed=? and type='person/posts' and url=?", feed["id"], address):
			source_remove(feed, source, identity["id"], False)
		return {}
	return {"error": mochi.app.label("errors.invalid_data")}

def function_mastodon_notifications(context, account, home, rows=None):
	"""What notifications of this app's are, for the interface: a comment is
	a reply (a mention, as Mastodon calls one), a reaction a favourite, and
	what the account's events on the fediverse were - a follow, a boost of
	one of its posts, a mention of it. One answer for each row, None for a
	row that is none of these or names what is gone."""
	identity = mastodon_identity()
	user_id = identity["id"] if identity else ""
	out = []
	for row in rows or []:
		out.append(mastodon_notification(account, row, user_id))
	return out

def mastodon_notification(account, row, user_id):
	"""One notification row as function_mastodon_notifications answers it."""
	if type(row) != "dict":
		return None
	topic = str(row.get("topic", ""))
	object = str(row.get("object", ""))
	event = str(row.get("event", ""))
	# A feed's notifications of a kind roll up on one row, the feed's; the
	# event names the comment, the post or the reaction (send_notification).
	item = event[len(topic) + 1:] if event.startswith(topic + ":") else ""
	if topic in ("comment/mine", "comment/thread", "mention"):
		comment = mastodon_comment_of(item, user_id)
		if comment:
			return {"type": "mention", "comment": comment}
		post = mastodon_post_of(item, user_id)
		if post:
			return {"type": "mention", "post": post}
		return None
	if topic in ("reaction/mine", "reaction/thread"):
		parts = item.split(":")
		if len(parts) < 3:
			return None
		target = parts[0]
		reactor = ":".join(parts[1:-1])
		reaction = mochi.db.row("select name from reactions where (comment=? or (post=? and comment='')) and subscriber=? limit 1", target, target, reactor)
		person = mastodon_person(reactor, reaction["name"] if reaction else "")
		comment = mastodon_comment_of(target, user_id)
		if comment:
			return {"type": "favourite", "comment": comment, "person": person}
		post = mastodon_post_of(target, user_id)
		if post:
			return {"type": "favourite", "post": post, "person": person}
		return None
	if topic == "account" and object == account:
		kind, _, rest = event.removeprefix("account:").partition(":")
		if kind == "follow" and rest:
			return {"type": "follow", "person": mastodon_person(rest, "")}
		if kind == "boost" and rest:
			actor, _, post_id = rest.rpartition(":")
			post = mastodon_post_of(post_id, user_id)
			if post and actor:
				return {"type": "reblog", "post": post, "person": mastodon_person(actor, "")}
		if kind == "mention" and rest:
			return {"type": "mention", "remote": rest}
	return None

def mastodon_person(id, name):
	"""Someone who did something, as a notification names them: a person
	elsewhere by their id, with what their server says of them; a person
	here by their identity and name."""
	if id.startswith("https://"):
		person = account_person(id)
		return {"id": id, "name": person["name"] or name, "address": person["address"], "avatar": person["avatar"], "url": person["page"]}
	return {"identity": id, "name": name}

# === Bluesky apps (the federation plan, phase 28) ===
#
# What a Bluesky app writes to a hosted account's repository, core tells
# here (atproto/written): a post is kept in the account's home feed, the
# record its copy on the account, so it is not published there again; a
# reply to a post a feed holds is a comment on it; a like or a repost of a
# post a feed holds is its reaction or its boost; a follow is a source of
# the home feed (decision 42). A delete takes each back, and an edit follows.

def bluesky_held(uri):
	"""The post a record URI names here: one from Bluesky by its id, or one
	of the user's own by its copy."""
	if not uri:
		return None
	post = mochi.db.row("select * from posts where remote=?", uri)
	if post:
		return post
	copy = mochi.db.row("select post from copies where remote=?", uri)
	if copy:
		return mochi.db.row("select * from posts where id=?", copy["post"])
	return None

def bluesky_subject(record):
	"""The URI a like, a repost or a reply names."""
	if type(record) != "dict":
		return ""
	subject = record.get("subject")
	if type(subject) == "dict":
		return str(subject.get("uri", "") or "")
	return str(subject or "")

def function_atproto_written(context, account, home, action, collection, rkey, uri, record=None, media=None):
	"""Mirror what a Bluesky app wrote to the account's repository."""
	identity = mastodon_identity()
	acc = publish_account(account)
	if not identity or not acc or not hosted_bluesky(acc):
		return None
	record = record if type(record) == "dict" else {}
	user_id, name = identity["id"], identity["name"]
	if collection == "app.bsky.feed.post":
		return bluesky_post_written(acc, home, action, uri, record, media, user_id, name)
	if collection == "app.bsky.feed.like":
		post = bluesky_held(bluesky_subject(record))
		if not post:
			return None
		if action == "delete":
			post_react(post["feed"], post["id"], user_id, name, "", account)
		elif action == "create":
			mochi.db.execute("insert or replace into likes (post, account, remote, created) values (?, ?, ?, ?)", post["id"], account, uri, mochi.time.now())
			post_react(post["feed"], post["id"], user_id, name, "like", account)
		return {}
	if collection == "app.bsky.feed.repost":
		if action == "delete":
			mochi.db.execute("delete from copies where account=? and remote=?", account, uri)
			return {}
		post = bluesky_held(bluesky_subject(record))
		if post and action == "create":
			copy_record(post["feed"], post["id"], acc, {"id": uri, "url": ""})
		return {}
	if collection == "app.bsky.graph.follow":
		did = str(record.get("subject", "") or "")
		if not did.startswith("did:"):
			return None
		if action == "delete":
			for source in mochi.db.rows("select * from sources where type='person/posts' and account=? and url=?", account, did):
				feed = mochi.db.row("select * from feeds where id=?", source["feed"])
				if feed:
					source_remove(feed, source, user_id, False, False)
			return {}
		feed, refusal = mastodon_home(home)
		if refusal:
			return refusal
		if mochi.db.exists("select 1 from sources where type='person/posts' and account=? and url=?", account, did):
			return {}
		found = lookup_person(did)
		if not found or found["kind"] == "post" or found["network"] != "bluesky":
			return None
		# The follow record is the app's: following again finds it and writes
		# no second one.
		person_follow_create(feed, found, acc, found["name"], user_id)
		return {}
	return None

def bluesky_post_written(acc, home, action, uri, record, media, user_id, name):
	"""A post record written, changed or deleted by an app."""
	copy = mochi.db.row("select * from copies where account=? and remote=?", acc["id"], uri)
	reply = mochi.db.row("select comment from replies where account=? and remote=?", acc["id"], uri)
	if action == "delete":
		if reply:
			comment = mochi.db.row("select * from comments where id=?", reply["comment"])
			mochi.db.execute("delete from replies where remote=?", uri)
			if comment:
				comment_delete(comment["feed"], comment["id"], comment["post"], user_id)
		elif copy:
			post = mochi.db.row("select * from posts where id=?", copy["post"])
			if post:
				post_delete(post["feed"], post["id"], user_id)
		return {}
	text = str(record.get("text", "") or "")
	if action == "update" and (copy or reply):
		if reply:
			comment = mochi.db.row("select * from comments where id=?", reply["comment"])
			if comment:
				comment_edit(comment["feed"], comment["id"], comment["post"], user_id, text)
			return {}
		post = mochi.db.row("select * from posts where id=?", copy["post"])
		if not post:
			return {}
		# The record is already changed: the copy is set aside while the post
		# is edited, so the edit is not written to it again.
		mochi.db.execute("delete from copies where post=? and account=?", copy["post"], acc["id"])
		data = json.decode(post.get("data", "") or "{}", None)
		post_edit(post["feed"], post["id"], user_id, text, data if type(data) == "dict" and data else None, {}, lambda post_id, info: None)
		mochi.db.execute("insert or replace into copies (post, account, address, network, remote, url, created) values (?, ?, ?, ?, ?, ?, ?)",
			copy["post"], copy["account"], copy["address"], copy["network"], copy["remote"], copy["url"], copy["created"])
		return {}
	if copy or reply:
		return {}
	parent = ""
	if type(record.get("reply")) == "dict" and type(record["reply"].get("parent")) == "dict":
		parent = str(record["reply"]["parent"].get("uri", "") or "")
	held = bluesky_held(parent)
	if held:
		# A reply to a post a feed holds is a comment on it, the record its
		# reply on the network.
		result, failure = comment_create(held["feed"], held["id"], "", user_id, name, text, "", "", None, mastodon_media_save(media))
		if failure:
			return mastodon_failure(failure)
		replies_record(result["id"], acc["id"], {"address": acc.get("identifier", ""), "network": "bluesky", "remote": uri, "url": ""})
		return {"comment": result["id"]}
	feed, refusal = mastodon_home(home)
	if refusal:
		return refusal
	accounts = [a for a in publish_list(feed["id"]) if a != acc["id"]]
	post_id, attachments, failure = post_create(feed, user_id, name, text, None, {}, accounts, mastodon_media_save(media), "text")
	if failure:
		return mastodon_failure(failure)
	copy_record(feed["id"], post_id, acc, {"id": uri, "url": ""})
	return {"post": post_id}
