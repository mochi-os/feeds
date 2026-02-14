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
import { formatTimestamp } from '@mochi/common'

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
    ? 'Subscribe to get updates from this feed'
    : 'Subscribe to get updates'
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
  myReaction?: string
): ReturnType<typeof createReactionCounts> => {
  const counts = createReactionCounts()
  reactions?.forEach((reaction) => {
    if (isReactionId(reaction.reaction)) {
      counts[reaction.reaction] = (counts[reaction.reaction] ?? 0) + 1
    }
  })
  // Include user's own reaction in the count if not already counted
  if (myReaction && isReactionId(myReaction)) {
    const alreadyCounted = reactions?.some(
      (r) => r.subscriber && r.reaction === myReaction
    )
    if (!alreadyCounted) {
      counts[myReaction] = (counts[myReaction] ?? 0) + 1
    }
  }
  return counts
}

const mapComment = (comment: ApiComment): FeedComment => {
  return {
    id: comment.id,
    author: comment.name ?? 'Subscriber',
    avatar: undefined,
    createdAt: formatTimestamp(comment.created),
    body: comment.body ?? '',
    reactions: toReactionCounts(comment.reactions, comment.my_reaction),
    userReaction: isReactionId(comment.my_reaction)
      ? comment.my_reaction
      : null,
    attachments: comment.attachments,
    replies: comment.children?.map(mapComment) ?? [],
  }
}

const deriveTitle = (post: Post): string => {
  if (post.body?.trim()) {
    const firstLine = post.body.trim().split('\n')[0]
    return firstLine.slice(0, 120) + (firstLine.length > 120 ? '…' : '')
  }
  return post.feed_name ?? 'Feed update'
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
      owner: isOwner ? 'You' : 'Subscribed feed',
      subscribers: feed.subscribers ?? 0,
      unreadPosts: 0,
      lastActive: formatTimestamp(feed.updated, 'Recently active'),
      isSubscribed,
      isOwner,
      fingerprint: feed.fingerprint,
      server: feed.server,
      privacy: feed.privacy,
    }
  })
}

export const mapPosts = (posts?: Post[]): FeedPost[] => {
  if (!posts?.length) {
    return []
  }

  return posts.map((post) => ({
    id: post.id,
    // Strip 'feeds/' prefix from feed id if present
    feedId: post.feed.replace(/^feeds\//, ''),
    feedName: post.feed_name,
    title: deriveTitle(post),
    author: post.feed_name ?? 'Feed owner',
    role: post.feed_name ?? 'Feed',
    avatar: undefined,
    created: post.created ?? 0,
    createdAt: formatTimestamp(post.created),
    body: post.body ?? '',
    bodyHtml: post.body_markdown,
    data: post.data && Object.keys(post.data).length > 0 ? post.data : undefined,
    tags: [],
    attachments:
      post.attachments && post.attachments.length > 0
        ? post.attachments
        : undefined,
    reactions: toReactionCounts(post.reactions, post.my_reaction),
    userReaction: isReactionId(post.my_reaction) ? post.my_reaction : null,
    comments: (post.comments ?? []).map(mapComment),
    feedFingerprint: post.feed_fingerprint,
    up: post.up,
    down: post.down,
  }))
}
