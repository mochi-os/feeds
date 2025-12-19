import type { Comment } from './comments'
import type { Feed } from './feeds'

// Attachment type
export interface Attachment {
  id: string
  name: string
  size: number
  type: string
  created: number
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

// Post from backend
export interface Post {
  id: string
  feed: string
  feed_fingerprint: string
  feed_name: string
  body: string
  body_markdown: string
  created: number
  created_string: string
  updated: number
  attachments: Attachment[]
  my_reaction: string
  reactions: Reaction[]
  comments: Comment[]
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
  createdAt: string
  body: string
  tags?: string[]
  attachments?: Attachment[]
  reactions: ReactionCounts
  userReaction?: ReactionId | null
  comments: import('./comments').FeedComment[]
  feedFingerprint?: string
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
  attachments?: string[] // attachment IDs to keep, in order
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
