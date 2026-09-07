// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import type {
  Comment as ApiComment,
  Feed,
  FeedComment,
  FeedPost,
  FeedSummary,
  Post,
  Reaction,
  ReactionId,
} from '@/types'
import {
  createReactionCounts,
  reactionOptions,
} from '@/features/feeds/constants'
import { plural, t } from '@lingui/core/macro'
import { useAuthStore } from '@mochi/web'

const reactionIdSet = new Set<ReactionId>(
  reactionOptions.map((option) => option.id)
)

const isReactionId = (value: unknown): value is ReactionId => {
  return typeof value === 'string' && reactionIdSet.has(value as ReactionId)
}

const getEntity = (feed: Feed): Record<string, unknown> | undefined =>
  feed.entity && typeof feed.entity === 'object'
    ? (feed.entity as Record<string, unknown>)
    : undefined

const deriveDescription = (feed: Feed): string => {
  const entity = getEntity(feed)
  const description = entity?.description
  if (typeof description === 'string' && description.trim()) {
    return description
  }
  return feed.name
    ? t`Subscribe to get updates from this feed` : t`Subscribe to get updates`
}

const deriveTags = (feed: Feed): string[] => {
  const entity = getEntity(feed)
  const tags = entity?.tags
  if (Array.isArray(tags)) {
    return tags.filter((tag): tag is string => typeof tag === 'string')
  }
  return []
}

const toReactionCounts = (
  reactions?: Reaction[],
  myReaction?: string,
  currentUserId?: string
): ReturnType<typeof createReactionCounts> => {
  const counts = createReactionCounts()
  reactions?.forEach((reaction) => {
    if (isReactionId(reaction.reaction)) {
      counts[reaction.reaction] = (counts[reaction.reaction] ?? 0) + 1
    }
  })
  // Include the caller's own reaction in the count if the server's list did not
  // already carry the caller's own row. Test the caller specifically: a match on
  // any other subscriber who happens to share the reaction would wrongly drop
  // the caller's reaction from the count (undercount by one).
  if (myReaction && isReactionId(myReaction)) {
    const alreadyCounted = reactions?.some(
      (r) => !!currentUserId && r.subscriber === currentUserId && r.reaction === myReaction
    )
    if (!alreadyCounted) {
      counts[myReaction] = (counts[myReaction] ?? 0) + 1
    }
  }
  return counts
}

const mapComment = (comment: ApiComment, currentUserId?: string): FeedComment => {
  return {
    id: comment.id,
    subscriberId: comment.subscriber ?? '',
    author: comment.name ?? t`Subscriber`,
    avatar: undefined,
    created: comment.created ?? 0,
    body: comment.body ?? '',
    reactions: toReactionCounts(comment.reactions, comment.my_reaction, currentUserId),
    userReaction: isReactionId(comment.my_reaction)
      ? comment.my_reaction
      : null,
    attachments: comment.attachments,
    replies: comment.children?.map((child) => mapComment(child, currentUserId)) ?? [],
    attachment: comment.attachment || undefined,
    attachmentName: comment.attachment_name || undefined,
    attachmentCaption: comment.attachment_caption || undefined,
  }
}

const memoryPrefix = (post: Post): string => {
  const m = post.data?.memory
  if (!m) return ''
  return t`On this day, ${m.years_ago} ${plural(m.years_ago, { one: 'year', other: 'years' })} ago · `
}

export const mapFeedsToSummaries = (
  feeds?: Feed[],
  subscribedFeedIds?: Set<string>
): FeedSummary[] => {
  if (!feeds?.length) {
    return []
  }

  return feeds.map((feed) => {
    const isOwner = !!feed.owner
    // Strip 'feeds/' prefix from feed id if present
    const feedId = feed.id.replace(/^feeds\//, '')
    // Check isSubscribed from API response first, then fall back to subscribedFeedIds
    // This ensures the API's isSubscribed value is respected
    const isSubscribed =
      feed.isSubscribed !== undefined
        ? feed.isSubscribed
        : subscribedFeedIds !== undefined
        ? subscribedFeedIds.has(feed.id) || subscribedFeedIds.has(feedId) || isOwner
        : true

    return {
      id: feedId,
      name: feed.name || feed.fingerprint,
      description: deriveDescription(feed),
      tags: deriveTags(feed),
      owner: isOwner ? t`You` : t`Subscribed feed`,
      subscribers: feed.subscribers ?? 0,
      unreadPosts: feed.unread ?? 0,
      lastActive: feed.updated ?? 0,
      isSubscribed,
      isOwner,
      fingerprint: feed.fingerprint,
      server: feed.server,
      privacy: feed.privacy,
      ai_mode: feed.ai_mode,
      ai_account: feed.ai_account,
      read: feed.read,
      sort: feed.sort,
    }
  })
}

export const mapPosts = (
  posts?: Post[],
  currentUserId: string = useAuthStore.getState().identity
): FeedPost[] => {
  if (!posts?.length) {
    return []
  }

  return posts.map((post) => ({
    id: post.id,
    // Strip 'feeds/' prefix from feed id if present
    feedId: post.feed.replace(/^feeds\//, ''),
    feedName: post.feed_name,
    author: post.feed_name ?? t`Feed owner`,
    role: post.feed_name ?? t`Feed`,
    avatar: undefined,
    created: post.created ?? 0,
    body: memoryPrefix(post) + (post.body ?? ''),
    bodyHtml: post.body_markdown,
    data: post.data && Object.keys(post.data).length > 0 ? post.data : undefined,
    tags: post.tags ?? [],
    attachments:
      post.attachments && post.attachments.length > 0
        ? post.attachments
        : undefined,
    reactions: toReactionCounts(post.reactions, post.my_reaction, currentUserId),
    userReaction: isReactionId(post.my_reaction) ? post.my_reaction : null,
    comments: (post.comments ?? []).map((comment) => mapComment(comment, currentUserId)),
    feedFingerprint: post.feed_fingerprint,
    permissions: post.permissions,
    up: post.up,
    down: post.down,
    read: post.read ?? 0,
    source: post.source,
    score: post.score,
  }))
}
