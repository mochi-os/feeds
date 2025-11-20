export type ReactionId =
  | 'like'
  | 'dislike'
  | 'laugh'
  | 'amazed'
  | 'love'
  | 'sad'
  | 'angry'
  | 'agree'
  | 'disagree'

export type ReactionCounts = Record<ReactionId, number>

export type FeedSummary = {
  id: string
  name: string
  description: string
  tags: string[]
  owner: string
  subscribers: number
  unreadPosts: number
  lastActive: string
  isSubscribed: boolean
}

export type FeedComment = {
  id: string
  author: string
  avatar?: string
  createdAt: string
  body: string
  reactions: ReactionCounts
  userReaction?: ReactionId | null
  replies?: FeedComment[]
}

export type FeedPost = {
  id: string
  feedId: string
  title: string
  author: string
  role: string
  avatar?: string
  createdAt: string
  body: string
  tags?: string[]
  reactions: ReactionCounts
  userReaction?: ReactionId | null
  comments: FeedComment[]
}
