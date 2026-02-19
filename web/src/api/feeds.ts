import endpoints from '@/api/endpoints'
import { requestHelpers, createAppClient } from '@mochi/common'

const client = createAppClient({ appName: 'feeds' })
import type {
  CreateCommentRequest,
  CreateCommentResponse,
  CreateFeedRequest,
  CreateFeedResponse,
  CreatePostRequest,
  CreatePostResponse,
  DeleteCommentResponse,
  DeleteFeedResponse,
  DeletePostResponse,
  EditCommentResponse,
  EditPostRequest,
  EditPostResponse,
  FindFeedsResponse,
  GetNewCommentResponse,
  GetNewPostParams,
  GetNewPostResponse,
  ProbeFeedParams,
  ProbeFeedResponse,
  ReactToCommentResponse,
  ReactToPostResponse,
  SearchFeedsParams,
  SearchFeedsResponse,
  SubscribeFeedResponse,
  UnsubscribeFeedResponse,
  ViewFeedParams,
  ViewFeedResponse,
} from '@/types'

type DataEnvelope<T> = { data: T }
type MaybeWrapped<T> = T | DataEnvelope<T>

const devConsole = globalThis.console

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object'

const hasDataProperty = <T>(value: unknown): value is DataEnvelope<T> =>
  isRecord(value) && 'data' in value

const logUnexpectedStructure = (context: string, payload: unknown) => {
  if (import.meta.env.DEV) {
    devConsole?.warn?.(`[API] ${context} response shape unexpected`, payload)
  }
}

const toDataResponse = <T>(
  payload: MaybeWrapped<T>,
  context: string
): DataEnvelope<T> => {
  if (hasDataProperty<T>(payload)) {
    return { data: payload.data }
  }

  logUnexpectedStructure(context, payload)
  return { data: payload as T }
}

const omitUndefined = (
  params?: Record<string, string | undefined>
): Record<string, string> | undefined => {
  if (!params) {
    return undefined
  }

  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined
  ) as Array<[string, string]>

  if (entries.length === 0) {
    return undefined
  }

  return Object.fromEntries(entries)
}

const viewFeed = async (params?: ViewFeedParams): Promise<ViewFeedResponse> => {
  // Get posts for a specific feed or all posts
  const endpoint = params?.feed
    ? endpoints.feeds.posts(params.feed)
    : endpoints.feeds.info

  const response = await client.get<
    ViewFeedResponse | ViewFeedResponse['data']
  >(endpoint, {
    params: omitUndefined({
      post: params?.post,
      before: params?.before?.toString(),
      limit: params?.limit?.toString(),
      sort: params?.sort,
    }),
  })

  return toDataResponse<ViewFeedResponse['data']>(response, 'view feeds')
}

interface GetFeedParams {
  limit?: number
  before?: number
  server?: string // For remote feeds not stored locally
  sort?: string
  _t?: number // Cache buster
}

const getFeed = async (
  feedId: string,
  params?: GetFeedParams
): Promise<ViewFeedResponse> => {
  const response = await client.get<
    ViewFeedResponse | ViewFeedResponse['data']
  >(endpoints.feeds.posts(feedId), {
    params: omitUndefined({
      limit: params?.limit?.toString(),
      before: params?.before?.toString(),
      server: params?.server,
      sort: params?.sort,
      _t: params?._t?.toString(),
    }),
  })

  return toDataResponse<ViewFeedResponse['data']>(response, 'view feed')
}

const getFeedInfo = async (feedId: string): Promise<ViewFeedResponse> => {
  const response = await client.get<
    ViewFeedResponse | ViewFeedResponse['data']
  >(endpoints.feeds.entityInfo(feedId))

  return toDataResponse<ViewFeedResponse['data']>(response, 'get feed info')
}

const getPost = async (
  feedId: string,
  postId: string
): Promise<ViewFeedResponse> => {
  const response = await client.get<
    ViewFeedResponse | ViewFeedResponse['data']
  >(endpoints.feeds.post.get(feedId, postId))

  return toDataResponse<ViewFeedResponse['data']>(response, 'view post')
}

const createFeed = async (
  payload: CreateFeedRequest
): Promise<CreateFeedResponse> => {
  const body: Record<string, string> = {
    name: payload.name,
    privacy: payload.privacy,
  }
  if (payload.memories === false) {
    body.memories = 'false'
  }

  const response = await client.post<
    CreateFeedResponse | CreateFeedResponse['data'],
    Record<string, string>
  >(endpoints.feeds.create, body)

  return toDataResponse<CreateFeedResponse['data']>(response, 'create feed')
}

const getFindFeeds = async (): Promise<FindFeedsResponse> => {
  const response = await client.get<
    FindFeedsResponse | FindFeedsResponse['data']
  >(endpoints.feeds.info)

  return toDataResponse<FindFeedsResponse['data']>(response, 'find feeds')
}

const searchFeeds = async (
  params: SearchFeedsParams
): Promise<SearchFeedsResponse> => {
  const response = await client.get<
    SearchFeedsResponse | SearchFeedsResponse['data']
  >(endpoints.feeds.search, {
    params: { search: params.search },
  })

  return toDataResponse<SearchFeedsResponse['data']>(response, 'search feeds')
}

const probeFeed = async (
  params: ProbeFeedParams
): Promise<ProbeFeedResponse> => {
  const response = await client.get<
    ProbeFeedResponse | ProbeFeedResponse['data']
  >(endpoints.feeds.probe, {
    params: { url: params.url },
  })

  return toDataResponse<ProbeFeedResponse['data']>(response, 'probe feed')
}

// Recommended feed from recommendations service
export interface RecommendedFeed {
  id: string
  name: string
  blurb: string
  fingerprint: string
}

export interface RecommendationsResponse {
  data: {
    feeds: RecommendedFeed[]
  }
}

const getRecommendations = async (): Promise<RecommendationsResponse> => {
  const response = await client.get<
    RecommendationsResponse | RecommendationsResponse['data']
  >(endpoints.feeds.recommendations)

  return toDataResponse<RecommendationsResponse['data']>(response, 'get recommendations')
}

const subscribeToFeed = async (
  feedId: string,
  server?: string
): Promise<SubscribeFeedResponse> => {
  const response = await client.post<
    SubscribeFeedResponse | SubscribeFeedResponse['data'],
    { feed: string; server?: string }
  >(endpoints.feeds.subscribe, { feed: feedId, server })

  return toDataResponse<SubscribeFeedResponse['data']>(
    response,
    'subscribe to feed'
  )
}

const unsubscribeFromFeed = async (
  feedId: string
): Promise<UnsubscribeFeedResponse> => {
  const response = await client.post<
    UnsubscribeFeedResponse | UnsubscribeFeedResponse['data'],
    { feed: string }
  >(endpoints.feeds.unsubscribe, { feed: feedId })

  return toDataResponse<UnsubscribeFeedResponse['data']>(
    response,
    'unsubscribe from feed'
  )
}

const deleteFeed = async (feedId: string): Promise<DeleteFeedResponse> => {
  const response = await client.post<
    DeleteFeedResponse | DeleteFeedResponse['data'],
    { feed: string }
  >(endpoints.feeds.delete(feedId), { feed: feedId })

  return toDataResponse<DeleteFeedResponse['data']>(response, 'delete feed')
}

interface RenameFeedResponse {
  data: { success: boolean }
}

const renameFeed = async (
  feedId: string,
  name: string
): Promise<RenameFeedResponse> => {
  const response = await client.post<
    RenameFeedResponse | RenameFeedResponse['data'],
    { feed: string; name: string }
  >(endpoints.feeds.rename(feedId), { feed: feedId, name })

  return toDataResponse<RenameFeedResponse['data']>(response, 'rename feed')
}

const getNewPostForm = async (
  feedId: string,
  params?: GetNewPostParams
): Promise<GetNewPostResponse> => {
  const response = await client.get<
    GetNewPostResponse | GetNewPostResponse['data']
  >(endpoints.feeds.post.new(feedId), {
    params: omitUndefined({ current: params?.current }),
  })

  return toDataResponse<GetNewPostResponse['data']>(response, 'new post form')
}

const createPost = async (
  payload: CreatePostRequest
): Promise<CreatePostResponse> => {
  const formData = new FormData()
  formData.append('feed', payload.feed)
  formData.append('body', payload.body)

  // Add optional data as JSON
  if (payload.data && Object.keys(payload.data).length > 0) {
    formData.append('data', JSON.stringify(payload.data))
  }

  // Spec uses 'files' as array field name
  if (payload.files && payload.files.length > 0) {
    for (const file of payload.files) {
      formData.append('files', file)
    }
  }

  const response = await client.post<
    CreatePostResponse | CreatePostResponse['data'],
    FormData
  >(endpoints.feeds.post.create(payload.feed), formData, {
    headers: {
      'Content-Type': undefined,
    },
  })

  return toDataResponse<CreatePostResponse['data']>(response, 'create post')
}

const reactToPost = async (
  feedId: string,
  postId: string,
  reaction: string
): Promise<ReactToPostResponse> => {
  const response = await client.post<
    ReactToPostResponse | ReactToPostResponse['data'],
    { feed: string; post: string; reaction: string }
  >(endpoints.feeds.post.react(feedId, postId), {
    feed: feedId,
    post: postId,
    reaction: reaction || 'none', // Send "none" to remove reaction
  })

  return toDataResponse<ReactToPostResponse['data']>(response, 'react to post')
}

const editPost = async (
  payload: EditPostRequest
): Promise<EditPostResponse> => {
  const formData = new FormData()
  formData.append('feed', payload.feed)
  formData.append('post', payload.post)
  formData.append('body', payload.body)

  // Add optional data as JSON (checkin, travelling)
  if (payload.data && Object.keys(payload.data).length > 0) {
    formData.append('data', JSON.stringify(payload.data))
  }

  // Order list (existing IDs and "new:N" placeholders for new files)
  if (payload.order) {
    for (const item of payload.order) {
      formData.append('order', item)
    }
  }

  // New files to add
  if (payload.files && payload.files.length > 0) {
    for (const file of payload.files) {
      formData.append('files', file)
    }
  }

  const response = await client.post<
    EditPostResponse | EditPostResponse['data'],
    FormData
  >(endpoints.feeds.post.edit(payload.feed, payload.post), formData, {
    headers: {
      'Content-Type': undefined,
    },
  })

  return toDataResponse<EditPostResponse['data']>(response, 'edit post')
}

const deletePost = async (
  feedId: string,
  postId: string
): Promise<DeletePostResponse> => {
  const response = await client.post<
    DeletePostResponse | DeletePostResponse['data'],
    { feed: string; post: string }
  >(endpoints.feeds.post.delete(feedId, postId), {
    feed: feedId,
    post: postId,
  })

  return toDataResponse<DeletePostResponse['data']>(response, 'delete post')
}

const getNewCommentForm = async (
  feedId: string,
  postId: string,
  parent?: string
): Promise<GetNewCommentResponse> => {
  const response = await client.get<
    GetNewCommentResponse | GetNewCommentResponse['data']
  >(endpoints.feeds.comment.new(feedId, postId), {
    params: omitUndefined({ parent }),
  })

  return toDataResponse<GetNewCommentResponse['data']>(
    response,
    'new comment form'
  )
}

const createComment = async (
  payload: CreateCommentRequest
): Promise<CreateCommentResponse> => {
  // Spec requires multipart/form-data
  const formData = new FormData()
  formData.append('feed', payload.feed)
  formData.append('post', payload.post)
  formData.append('body', payload.body)
  if (payload.parent) {
    formData.append('parent', payload.parent)
  }
  if (payload.id) {
    formData.append('id', payload.id)
  }
  if (payload.files) {
    for (const file of payload.files) {
      formData.append('files', file)
    }
  }

  const response = await client.post<
    CreateCommentResponse | CreateCommentResponse['data'],
    FormData
  >(endpoints.feeds.comment.create(payload.feed, payload.post), formData)

  return toDataResponse<CreateCommentResponse['data']>(
    response,
    'create comment'
  )
}

const reactToComment = async (
  feedId: string,
  postId: string,
  commentId: string,
  reaction: string
): Promise<ReactToCommentResponse> => {
  const response = await client.post<
    ReactToCommentResponse | ReactToCommentResponse['data'],
    { feed: string; comment: string; reaction: string }
  >(endpoints.feeds.comment.react(feedId, postId), {
    feed: feedId,
    comment: commentId,
    reaction: reaction || 'none', // Send "none" to remove reaction
  })

  return toDataResponse<ReactToCommentResponse['data']>(
    response,
    'react to comment'
  )
}

const editComment = async (
  feedId: string,
  postId: string,
  commentId: string,
  body: string
): Promise<EditCommentResponse> => {
  const response = await client.post<
    EditCommentResponse | EditCommentResponse['data'],
    { feed: string; post: string; comment: string; body: string }
  >(endpoints.feeds.comment.edit(feedId, postId, commentId), {
    feed: feedId,
    post: postId,
    comment: commentId,
    body,
  })

  return toDataResponse<EditCommentResponse['data']>(response, 'edit comment')
}

const deleteComment = async (
  feedId: string,
  postId: string,
  commentId: string
): Promise<DeleteCommentResponse> => {
  const response = await client.post<
    DeleteCommentResponse | DeleteCommentResponse['data'],
    { feed: string; post: string; comment: string }
  >(endpoints.feeds.comment.delete(feedId, postId, commentId), {
    feed: feedId,
    post: postId,
    comment: commentId,
  })

  return toDataResponse<DeleteCommentResponse['data']>(
    response,
    'delete comment'
  )
}

// Member management types
interface Member {
  id: string
  name: string
}

interface MembersListResponse {
  data: { members: Member[] }
}

interface MemberAddResponse {
  data: { success: boolean; member: Member }
}

interface MemberRemoveResponse {
  data: { success: boolean }
}

const getMembers = async (feedId: string): Promise<MembersListResponse> => {
  const response = await client.get<
    MembersListResponse | MembersListResponse['data']
  >(endpoints.feeds.members(feedId))

  return toDataResponse<MembersListResponse['data']>(response, 'list members')
}

const addMember = async (
  feedId: string,
  memberId: string
): Promise<MemberAddResponse> => {
  const response = await client.post<
    MemberAddResponse | MemberAddResponse['data'],
    { feed: string; member: string }
  >(endpoints.feeds.membersAdd(feedId), { feed: feedId, member: memberId })

  return toDataResponse<MemberAddResponse['data']>(response, 'add member')
}

const removeMember = async (
  feedId: string,
  memberId: string
): Promise<MemberRemoveResponse> => {
  const response = await client.post<
    MemberRemoveResponse | MemberRemoveResponse['data'],
    { feed: string; member: string }
  >(endpoints.feeds.membersRemove(feedId), { feed: feedId, member: memberId })

  return toDataResponse<MemberRemoveResponse['data']>(response, 'remove member')
}

// Access control types
export interface AccessRule {
  id: number
  subject: string
  name?: string // Resolved name for entity subjects
  resource: string
  operation: string
  grant: number // 1 = allow, 0 = deny
  granter: string
  created: number
  isOwner?: boolean // True if this rule is for the resource owner
}

interface AccessListResponse {
  data: { rules: AccessRule[] }
}

interface AccessModifyResponse {
  data: { success: boolean }
}

const getAccessRules = async (feedId: string): Promise<AccessListResponse> => {
  const response = await client.get<
    AccessListResponse | AccessListResponse['data']
  >(endpoints.feeds.access(feedId))

  return toDataResponse<AccessListResponse['data']>(response, 'list access rules')
}

// Set access level for a subject
// Levels: comment (can comment, react, view), react (can react, view),
//         view (can view only), none (explicitly blocked)
const setAccessLevel = async (
  feedId: string,
  subject: string,
  level: string
): Promise<AccessModifyResponse> => {
  const response = await client.post<
    AccessModifyResponse | AccessModifyResponse['data'],
    { feed: string; subject: string; level: string }
  >(endpoints.feeds.accessSet(feedId), { feed: feedId, subject, level })

  return toDataResponse<AccessModifyResponse['data']>(response, 'set access level')
}

// Revoke all access for a subject (removes them from the access list)
const revokeAccess = async (
  feedId: string,
  subject: string
): Promise<AccessModifyResponse> => {
  const response = await client.post<
    AccessModifyResponse | AccessModifyResponse['data'],
    { feed: string; subject: string }
  >(endpoints.feeds.accessRevoke(feedId), { feed: feedId, subject })

  return toDataResponse<AccessModifyResponse['data']>(response, 'revoke access')
}

// User search result from People app
export interface UserSearchResult {
  id: string
  name: string
}

export interface UserSearchResponse {
  results: UserSearchResult[]
}

// Group from People app
export interface Group {
  id: string
  name: string
  description?: string
}

export interface GroupListResponse {
  groups: Group[]
}

// Search local users (via People app)
// Uses requestHelpers for cross-app API call with absolute URL
const searchUsers = async (query: string): Promise<UserSearchResponse> => {
  const formData = new URLSearchParams()
  formData.append('search', query)

  return requestHelpers.post<UserSearchResponse>(
    endpoints.users.search,
    formData.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  )
}

// List groups (via People app)
// Uses requestHelpers for cross-app API call with absolute URL
const listGroups = async (): Promise<GroupListResponse> => {
  return requestHelpers.get<GroupListResponse>(endpoints.groups.list)
}

// Source management types
import type { Source } from '@/types'

interface SourcesListResponse {
  data: { sources: Source[] }
}

interface SourceAddResponse {
  data: { source: Source; ingested: number }
}

interface SourceRemoveResponse {
  data: { success: boolean }
}

interface SourcePollResponse {
  data: { fetched: number }
}

const getSources = async (feedId: string): Promise<SourcesListResponse> => {
  const response = await client.get<
    SourcesListResponse | SourcesListResponse['data']
  >(endpoints.feeds.sources(feedId))

  return toDataResponse<SourcesListResponse['data']>(response, 'list sources')
}

const addSource = async (
  feedId: string,
  type: string,
  url: string,
  name?: string,
  server?: string
): Promise<SourceAddResponse> => {
  const payload: Record<string, string> = { feed: feedId, type, url }
  if (name) payload.name = name
  if (server) payload.server = server

  const response = await client.post<
    SourceAddResponse | SourceAddResponse['data'],
    Record<string, string>
  >(endpoints.feeds.sourcesAdd(feedId), payload)

  return toDataResponse<SourceAddResponse['data']>(response, 'add source')
}

const removeSource = async (
  feedId: string,
  sourceId: string,
  deletePosts?: boolean
): Promise<SourceRemoveResponse> => {
  const payload: Record<string, string> = { feed: feedId, source: sourceId }
  if (deletePosts) payload.delete_posts = 'true'

  const response = await client.post<
    SourceRemoveResponse | SourceRemoveResponse['data'],
    Record<string, string>
  >(endpoints.feeds.sourcesRemove(feedId), payload)

  return toDataResponse<SourceRemoveResponse['data']>(response, 'remove source')
}

const pollSource = async (
  feedId: string,
  sourceId?: string
): Promise<SourcePollResponse> => {
  const payload: Record<string, string> = { feed: feedId }
  if (sourceId) payload.source = sourceId

  const response = await client.post<
    SourcePollResponse | SourcePollResponse['data'],
    Record<string, string>
  >(endpoints.feeds.sourcesPoll(feedId), payload)

  return toDataResponse<SourcePollResponse['data']>(response, 'poll source')
}

const getRssToken = async (
  entity: string,
  mode: 'posts' | 'all'
): Promise<{ token: string }> => {
  const response = await client.post<{ data: { token: string } }>(
    endpoints.feeds.rssToken,
    { entity, mode }
  )
  return toDataResponse<{ token: string }>(response, 'get rss token').data
}

export const feedsApi = {
  view: viewFeed,
  get: getFeed,
  getInfo: getFeedInfo,
  getPost,
  create: createFeed,
  delete: deleteFeed,
  rename: renameFeed,
  find: getFindFeeds,
  search: searchFeeds,
  probe: probeFeed,
  recommendations: getRecommendations,
  subscribe: subscribeToFeed,
  unsubscribe: unsubscribeFromFeed,
  getNewPostForm,
  createPost,
  editPost,
  deletePost,
  reactToPost,
  getNewCommentForm,
  createComment,
  editComment,
  deleteComment,
  reactToComment,
  getMembers,
  addMember,
  removeMember,
  getAccessRules,
  setAccessLevel,
  revokeAccess,
  searchUsers,
  listGroups,
  getRssToken,
  getSources,
  addSource,
  removeSource,
  pollSource,
}
