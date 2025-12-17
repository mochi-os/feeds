import type { Feed } from './feeds'
import type { Reaction, ReactionCounts, ReactionId, ReactionInput } from './posts'

// Comment from backend
export interface Comment {
  id: string
  feed: string
  feed_fingerprint: string
  post: string
  parent: string
  subscriber: string
  name: string
  body: string
  body_markdown: string
  created: number
  created_string: string
  user: string
  my_reaction: string
  reactions: Reaction[]
  children: Comment[]
}

// Client-side comment for display
export interface FeedComment {
  id: string
  author: string
  avatar?: string
  createdAt: string
  body: string
  reactions: ReactionCounts
  userReaction?: ReactionId | null
  replies?: FeedComment[]
}

// New comment form
export interface GetNewCommentParams {
  feed: string
  post: string
  parent?: string
}

export interface GetNewCommentResponse {
  data: {
    feed: Feed
    post: string
    parent?: string
  }
}

// Create comment
export interface CreateCommentRequest {
  feed: string
  post: string
  body: string
  parent?: string
}

export interface CreateCommentResponse {
  data: {
    id: string
    feed: Feed
    post: string
  }
}

// React to comment
export interface ReactToCommentRequest {
  comment: string
  reaction: ReactionInput
}

export interface ReactToCommentResponse {
  data: {
    feed: Feed
    post: string
    comment: string
    reaction: ReactionInput
  }
}
