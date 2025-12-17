import type { ReactionCounts, ReactionId } from '@/types'

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
  TOAST_POST_CREATED: 'Post created successfully',
  TOAST_POST_FAILED: 'Failed to create post. Please try again.',
  TOAST_FEED_CREATED: (feedName: string) => `Feed "${feedName}" created successfully`,
  TOAST_FEED_FAILED: 'Failed to create feed. Please try again.',
  TOAST_COMMENT_CREATED: 'Comment added',
  TOAST_COMMENT_FAILED: 'Failed to add comment. Please try again.',
  TOAST_REPLY_FAILED: 'Failed to add reply. Please try again.',

  // Feed creation
  DEFAULT_FEED_DESCRIPTION: 'Share updates and decisions in one place.',
  DEFAULT_TAG: 'General',

  // Authors
  AUTHOR_YOU: 'You',
  AUTHOR_FEED_OWNER: 'Feed Owner',
  AUTHOR_SUBSCRIBED_FEED: 'Subscribed feed',
  LOADING_PLACEHOLDER: 'Loading...',
  RECENTLY_ACTIVE: 'Recently active',

  // Feed Directory
  DIRECTORY_TITLE: 'Feeds directory',
  DIRECTORY_SUBTITLE: 'Search, subscribe, or jump into any space.',
  DIRECTORY_SEARCH_PLACEHOLDER: 'Search feeds or tags',
  DIRECTORY_SEARCHING: 'Searching feeds...',
  DIRECTORY_NO_RESULTS: 'No feeds match that search.',
  DIRECTORY_NO_RESULTS_HINT: 'Try another keyword or create a feed.',
  DIRECTORY_SUBSCRIBED_LABEL: 'Subscribe to get updates from this feed',
  DIRECTORY_FOLLOWING_BADGE: 'Following',
  DIRECTORY_UNREAD_SUFFIX: 'unread',
  DIRECTORY_SUBS_SUFFIX: 'subs',
  DIRECTORY_LAST_ACTIVE_PREFIX: 'Last active',
  DIRECTORY_BUTTON_OWNED: 'Owned',
  DIRECTORY_BUTTON_UNSUBSCRIBE: 'Unsubscribe',
  DIRECTORY_BUTTON_SUBSCRIBE: 'Subscribe',
} as const
