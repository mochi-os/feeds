// Feed privacy options
export type FeedPrivacy = 'public' | 'private'

// Permissions
export interface FeedPermissions {
  view: boolean
  react: boolean
  comment: boolean
  manage: boolean
}

// Feed from backend
export interface Feed {
  id: string
  fingerprint: string
  name: string
  privacy: FeedPrivacy
  owner: number
  subscribers: number
  updated: number
  server?: string // Server URL for remote feeds
  entity?: Record<string, unknown>
  isSubscribed?: boolean // Subscription status from API
  tag_account?: number
  score_account?: number
}

// Directory entry for search results
export interface DirectoryEntry {
  id: string
  fingerprint: string
  fingerprint_hyphens: string
  name: string
  class: string
  created: number
}

// Probe entry for URL-based remote feed lookup
export interface ProbeEntry {
  id: string
  fingerprint: string
  name: string
  class: string
  server: string
  remote: boolean
}

// Info responses
export interface FeedInfoClassResponse {
  entity: false
  feeds: Feed[]
}

export interface FeedInfoEntityResponse {
  entity: true
  feed: Feed
  permissions: FeedPermissions
  fingerprint: string
}

export type FeedInfoResponse = FeedInfoClassResponse | FeedInfoEntityResponse

// View params and response
export interface ViewFeedParams {
  feed?: string
  post?: string
  limit?: number
  before?: number  // Cursor: fetch posts created before this timestamp
  sort?: string
  tag?: string
}

export interface ViewFeedResponse {
  data: {
    feed?: Feed | Partial<Feed>
    posts?: import('./posts').Post[]
    feeds?: Feed[]
    owner?: boolean
    user?: string
    hasMore?: boolean
    nextCursor?: number  // Timestamp to use as 'before' for next page
    permissions?: FeedPermissions
  }
}

// Create feed
export interface CreateFeedRequest {
  name: string
  privacy: FeedPrivacy
  memories?: boolean
}

export interface CreateFeedResponse {
  data: {
    id: string
    fingerprint: string
  }
}

// Find feeds
export interface FindFeedsResponse {
  data: Record<string, unknown>
}

// Search feeds
export interface SearchFeedsParams {
  search: string
}

export interface SearchFeedsResponse {
  data: DirectoryEntry[]
}

// Probe feed by URL
export interface ProbeFeedParams {
  url: string
}

export interface ProbeFeedResponse {
  data: ProbeEntry
}

// Subscribe/unsubscribe
export interface SubscribeFeedResponse {
  data: {
    fingerprint: string
  }
}

export interface UnsubscribeFeedResponse {
  data: {
    success: boolean
  }
}

export interface DeleteFeedResponse {
  data: {
    success: boolean
  }
}

// Access Control
export interface AccessRule {
  id: number
  subject: string
  resource: string
  operation: string
  grant: number
  granter: string
  created: number
  name?: string
}

export interface AccessOwner {
  id: string
  name?: string
}

export interface AccessListResponse {
  rules: AccessRule[]
  owner?: AccessOwner | null
}

export interface AccessGrantResponse {
  success: boolean
}

export interface AccessDenyResponse {
  success: boolean
}

export interface AccessRevokeResponse {
  success: boolean
}

// Feed source (RSS or Mochi feed)
export interface Source {
  id: string
  feed: string
  type: string
  url: string
  name: string
  credibility: number
  base: number
  max: number
  interval: number
  next: number
  jitter: number
  changed: number
  etag: string
  modified: string
  ttl: number
  fetched: number
}

// Client-side feed summary for display
export interface FeedSummary {
  id: string
  name: string
  description: string
  tags: string[]
  owner: string
  subscribers: number
  unreadPosts: number
  lastActive: string
  isSubscribed: boolean
  allowSearch?: boolean
  isOwner?: boolean
  fingerprint?: string
  server?: string // Server hostname for remote feeds discovered via URL
  privacy?: FeedPrivacy // public or private
  permissions?: FeedPermissions
  tag_account?: number
  score_account?: number
}
