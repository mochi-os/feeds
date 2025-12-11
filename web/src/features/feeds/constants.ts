import { type ReactionCounts, type ReactionId } from './types'

export const reactionOptions: { id: ReactionId; label: string; emoji: string }[] = [
  { id: 'like', label: 'Like', emoji: '👍' },
  { id: 'dislike', label: 'Dislike', emoji: '👎' },
  { id: 'laugh', label: 'Laugh', emoji: '😂' },
  { id: 'amazed', label: 'Amazed', emoji: '😮' },
  { id: 'love', label: 'Love', emoji: '😍' },
  { id: 'sad', label: 'Sad', emoji: '😢' },
  { id: 'angry', label: 'Angry', emoji: '😡' },
  { id: 'agree', label: 'Agree', emoji: '🤝' },
  { id: 'disagree', label: 'Disagree', emoji: '🙅' },
]

export const createReactionCounts = (
  preset: Partial<ReactionCounts> = {}
): ReactionCounts => {
  return reactionOptions.reduce((acc, option) => {
    acc[option.id] = preset[option.id] ?? 0
    return acc
  }, {} as ReactionCounts)
}

/**
 * Centralized UI strings for the Feeds feature.
 * This makes it easier to maintain and potentially localize the app.
 */
export const STRINGS = {
  // Page titles
  PAGE_TITLE: 'Feeds',
  PAGE_DESCRIPTION: 'Organize long-form updates and follow the feeds that matter most.',
  SYNCING_MESSAGE: 'Syncing the latest updates…',

  // Feed actions
  SELECT_FEED_TITLE: 'Select a feed to get started',
  SELECT_FEED_DESCRIPTION: 'Choose a feed from the list to view posts, comments, and reactions.',

  // Posts
  NO_POSTS_YET: 'No posts yet',
  NO_POSTS_DESCRIPTION: 'Share an update above to start the conversation.',
  FEED_UPDATE: 'Feed update',
  JUST_NOW: 'Just now',

  // Comments
  COMMENT_PLACEHOLDER: 'Leave a comment...',
  POST_COMMENT: 'Post comment',
  DISCUSSION: 'Discussion',
  THREADS: 'threads',

  // Errors
  ERROR_SYNC_FAILED: 'Unable to sync with the feeds service. Showing cached data.',
  ERROR_LOAD_POSTS_FAILED: 'Unable to load posts for this feed right now.',
  ERROR_SUBSCRIPTION_FAILED: 'Failed to update subscription. Please try again.',

  // Toasts
  TOAST_SUBSCRIBED: (feedName: string) => `Subscribed to ${feedName}`,
  TOAST_UNSUBSCRIBED: (feedName: string) => `Unsubscribed from ${feedName}`,
  TOAST_SUBSCRIBE_FAILED: (feedName: string) => `Failed to subscribe to ${feedName}`,
  TOAST_UNSUBSCRIBE_FAILED: (feedName: string) => `Failed to unsubscribe from ${feedName}`,

  // Feed creation
  DEFAULT_FEED_DESCRIPTION: 'Share updates and decisions in one place.',
  DEFAULT_TAG: 'General',

  // Authors
  AUTHOR_YOU: 'You',
  AUTHOR_FEED_OWNER: 'Feed Owner',
  AUTHOR_SUBSCRIBED_FEED: 'Subscribed feed',
  LOADING_PLACEHOLDER: 'Loading...',
  RECENTLY_ACTIVE: 'Recently active',
} as const
