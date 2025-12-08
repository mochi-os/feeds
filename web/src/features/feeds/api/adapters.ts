import type { Feed } from '@/api/types/feeds'
import type { Comment as ApiComment } from '@/api/types/comments'
import type { Post, Reaction } from '@/api/types/posts'
import { createReactionCounts, reactionOptions } from '../constants'
import type { FeedComment, FeedPost, FeedSummary, ReactionId } from '../types'

const reactionIdSet = new Set<ReactionId>(reactionOptions.map((option) => option.id))

const isReactionId = (value: unknown): value is ReactionId => {
  return typeof value === 'string' && reactionIdSet.has(value as ReactionId)
}

const formatTimestamp = (timestamp?: number): string => {
  if (!timestamp) {
    return 'Recently active'
  }

  const date = new Date(timestamp * 1000)
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

const getEntity = (feed: Feed): Record<string, unknown> | undefined =>
  feed.entity && typeof feed.entity === 'object' ? (feed.entity as Record<string, unknown>) : undefined

const deriveDescription = (feed: Feed): string => {
  const entity = getEntity(feed)
  const description = entity?.description
  if (typeof description === 'string' && description.trim()) {
    return description
  }
  return `Updates from ${feed.fingerprint || feed.name}`
}

const deriveTags = (feed: Feed): string[] => {
  const entity = getEntity(feed)
  const tags = entity?.tags
  if (Array.isArray(tags)) {
    return tags.filter((tag): tag is string => typeof tag === 'string')
  }
  return []
}

const toReactionCounts = (reactions?: Reaction[]): ReturnType<typeof createReactionCounts> => {
  const counts = createReactionCounts()
  reactions?.forEach((reaction) => {
    if (isReactionId(reaction.reaction)) {
      counts[reaction.reaction] = (counts[reaction.reaction] ?? 0) + 1
    }
  })
  return counts
}

const mapComment = (comment: ApiComment): FeedComment => {
  return {
    id: comment.id,
    author: comment.name ?? 'Subscriber',
    avatar: undefined,
    createdAt: comment.created_string ?? formatTimestamp(comment.created),
    body: comment.body_markdown ?? comment.body ?? '',
    reactions: toReactionCounts(comment.reactions),
    userReaction: isReactionId(comment.my_reaction) ? comment.my_reaction : null,
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
    const isOwner = feed.owner === 1
    // If subscribedFeedIds is provided, use it to determine subscription status
    // Otherwise, assume all feeds in the list are subscribed (for backward compatibility)
    const isSubscribed =
      subscribedFeedIds !== undefined
        ? subscribedFeedIds.has(feed.id) || isOwner
        : true

    return {
      id: feed.id,
      name: feed.name || feed.fingerprint,
      description: deriveDescription(feed),
      tags: deriveTags(feed),
      owner: isOwner ? 'You' : 'Subscribed feed',
      subscribers: feed.subscribers ?? 0,
      unreadPosts: 0,
      lastActive: formatTimestamp(feed.updated),
      isSubscribed,
      isOwner,
      fingerprint: feed.fingerprint,
    }
  })
}

export const mapPosts = (posts?: Post[]): FeedPost[] => {
  if (!posts?.length) {
    return []
  }

  return posts.map((post) => ({
    id: post.id,
    feedId: post.feed,
    title: deriveTitle(post),
    author: post.feed_name ?? 'Feed owner',
    role: post.feed_name ?? 'Feed',
    avatar: undefined,
    createdAt: post.created_string ?? formatTimestamp(post.created),
    body: post.body_markdown ?? post.body ?? '',
    tags: [],
    attachments: post.attachments && post.attachments.length > 0 ? post.attachments : undefined,
    reactions: toReactionCounts(post.reactions),
    userReaction: isReactionId(post.my_reaction) ? post.my_reaction : null,
    comments: (post.comments ?? []).map(mapComment),
    feedFingerprint: post.feed_fingerprint,
  }))
}
