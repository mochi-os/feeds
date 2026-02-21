import type { Comment } from './comments'
import type { Feed, FeedPermissions } from './feeds'
import type { PostData } from '@mochi/common'

// Re-export PostData for convenience
export type { PostData }

// Attachment type
export interface Attachment {
  id: string
  name: string
  size: number
  type: string
  created: number
  url?: string
  thumbnail_url?: string
}

// Reaction types
export type ReactionType =
  | 'like'
  | 'dislike'
  | 'laugh'
  | 'amazed'
  | 'love'
  | 'sad'
  | 'angry'
  | 'agree'
  | 'disagree'

export type ReactionId = ReactionType
export type ReactionInput = '' | ReactionType
export type ReactionCounts = Record<ReactionId, number>

export interface Reaction {
  feed: string
  post: string
  comment?: string
  subscriber: string
  name: string
  reaction: ReactionType
}

// Tag on a post
export interface Tag {
  id: string
  label: string
  source?: string
  relevance?: number
}

// Source attribution for posts from external/internal sources
export interface PostSource {
  name: string
  url: string
  type: string
}

// Post from backend
export interface Post {
  id: string
  feed: string
  feed_fingerprint: string
  feed_name: string
  body: string
  body_markdown: string
  data: PostData
  created: number
  created_string: string
  updated: number
  attachments: Attachment[]
  my_reaction: string
  reactions: Reaction[]
  comments: Comment[]
  tags?: Tag[]
  up: number
  down: number
  source?: PostSource
}

// Client-side post for display
export interface FeedPost {
  id: string
  feedId: string
  feedName?: string
  title: string
  author: string
  role: string
  avatar?: string
  created: number
  createdAt: string
  body: string
  bodyHtml?: string
  data?: PostData
  tags?: Tag[]
  attachments?: Attachment[]
  reactions: ReactionCounts
  userReaction?: ReactionId | null
  comments: import('./comments').FeedComment[]
  feedFingerprint?: string
  isOwner?: boolean
  permissions?: FeedPermissions
  up?: number
  down?: number
  source?: PostSource
}

// New post form
export interface GetNewPostParams {
  current?: string
}

export interface GetNewPostResponse {
  data: {
    feeds: Feed[]
    current?: string
  }
}

// Create post
export interface CreatePostRequest {
  feed: string
  body: string
  data?: PostData
  files?: File[]
}

export interface CreatePostResponse {
  data: {
    feed: Feed
    id: string
    attachments: Attachment[]
  }
}

// React to post
export interface ReactToPostRequest {
  post: string
  reaction: ReactionInput
}

export interface ReactToPostResponse {
  data: {
    feed: Feed
    id: string
    reaction: ReactionInput
  }
}

// Edit post
export interface EditPostRequest {
  feed: string
  post: string
  body: string
  data?: PostData // location data (checkin, travelling)
  order?: string[] // order list with existing IDs and "new:N" placeholders for new files
  files?: File[] // new files to add
}

export interface EditPostResponse {
  data: {
    feed: Feed
    id: string
    edited: number
  }
}

// Delete post
export interface DeletePostResponse {
  data: {
    feed: Feed
    id: string
  }
}
