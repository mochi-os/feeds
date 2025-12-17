import endpoints from '@/api/endpoints'
import { feedsRequest } from '@/api/request'
import type {
  CreateCommentRequest,
  CreateCommentResponse,
  CreateFeedRequest,
  CreateFeedResponse,
  CreatePostRequest,
  CreatePostResponse,
  FindFeedsResponse,
  GetNewCommentResponse,
  GetNewPostParams,
  GetNewPostResponse,
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

  const response = await feedsRequest.get<
    ViewFeedResponse | ViewFeedResponse['data']
  >(endpoint, {
    params: params?.post ? { post: params.post } : undefined,
  })

  return toDataResponse<ViewFeedResponse['data']>(response, 'view feeds')
}

const getFeed = async (
  feedId: string,
  params?: Record<string, string | number>
): Promise<ViewFeedResponse> => {
  const response = await feedsRequest.get<
    ViewFeedResponse | ViewFeedResponse['data']
  >(endpoints.feeds.posts(feedId), {
    params,
  })

  return toDataResponse<ViewFeedResponse['data']>(response, 'view feed')
}

const getFeedInfo = async (feedId: string): Promise<ViewFeedResponse> => {
  const response = await feedsRequest.get<
    ViewFeedResponse | ViewFeedResponse['data']
  >(endpoints.feeds.entityInfo(feedId))

  return toDataResponse<ViewFeedResponse['data']>(response, 'get feed info')
}

const viewRemoteFeed = async (feedId: string): Promise<ViewFeedResponse> => {
  const response = await feedsRequest.get<
    ViewFeedResponse | ViewFeedResponse['data']
  >(endpoints.feeds.viewRemote, {
    params: { feed: feedId },
  })

  return toDataResponse<ViewFeedResponse['data']>(response, 'view remote feed')
}

const getPost = async (
  feedId: string,
  postId: string
): Promise<ViewFeedResponse> => {
  const response = await feedsRequest.get<
    ViewFeedResponse | ViewFeedResponse['data']
  >(endpoints.feeds.post.get(feedId, postId))

  return toDataResponse<ViewFeedResponse['data']>(response, 'view post')
}

const createFeed = async (
  payload: CreateFeedRequest
): Promise<CreateFeedResponse> => {
  const response = await feedsRequest.post<
    CreateFeedResponse | CreateFeedResponse['data'],
    CreateFeedRequest
  >(endpoints.feeds.create, payload)

  return toDataResponse<CreateFeedResponse['data']>(response, 'create feed')
}

const getFindFeeds = async (): Promise<FindFeedsResponse> => {
  const response = await feedsRequest.get<
    FindFeedsResponse | FindFeedsResponse['data']
  >(endpoints.feeds.info)

  return toDataResponse<FindFeedsResponse['data']>(response, 'find feeds')
}

const searchFeeds = async (
  params: SearchFeedsParams
): Promise<SearchFeedsResponse> => {
  const response = await feedsRequest.get<
    SearchFeedsResponse | SearchFeedsResponse['data']
  >(endpoints.feeds.search, {
    params: { search: params.search },
  })

  return toDataResponse<SearchFeedsResponse['data']>(response, 'search feeds')
}

const subscribeToFeed = async (
  feedId: string
): Promise<SubscribeFeedResponse> => {
  const response = await feedsRequest.post<
    SubscribeFeedResponse | SubscribeFeedResponse['data'],
    { feed: string }
  >(endpoints.feeds.subscribe(feedId), { feed: feedId })

  return toDataResponse<SubscribeFeedResponse['data']>(
    response,
    'subscribe to feed'
  )
}

const unsubscribeFromFeed = async (
  feedId: string
): Promise<UnsubscribeFeedResponse> => {
  const response = await feedsRequest.post<
    UnsubscribeFeedResponse | UnsubscribeFeedResponse['data'],
    { feed: string }
  >(endpoints.feeds.unsubscribe(feedId), { feed: feedId })

  return toDataResponse<UnsubscribeFeedResponse['data']>(
    response,
    'unsubscribe from feed'
  )
}

const getNewPostForm = async (
  feedId: string,
  params?: GetNewPostParams
): Promise<GetNewPostResponse> => {
  const response = await feedsRequest.get<
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

  // Spec uses 'files' as array field name
  if (payload.files && payload.files.length > 0) {
    for (const file of payload.files) {
      formData.append('files', file)
    }
  }

  const response = await feedsRequest.post<
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
  const response = await feedsRequest.post<
    ReactToPostResponse | ReactToPostResponse['data'],
    { post: string; reaction: string }
  >(endpoints.feeds.post.react(feedId, postId), {
    post: postId,
    reaction: reaction,
  })

  return toDataResponse<ReactToPostResponse['data']>(response, 'react to post')
}

const getNewCommentForm = async (
  feedId: string,
  postId: string,
  parent?: string
): Promise<GetNewCommentResponse> => {
  const response = await feedsRequest.get<
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

  const response = await feedsRequest.post<
    CreateCommentResponse | CreateCommentResponse['data'],
    FormData
  >(endpoints.feeds.comment.create(payload.feed, payload.post), formData, {
    headers: {
      'Content-Type': undefined,
    },
  })

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
  const response = await feedsRequest.post<
    ReactToCommentResponse | ReactToCommentResponse['data'],
    { comment: string; reaction: string }
  >(endpoints.feeds.comment.react(feedId, postId), {
    comment: commentId,
    reaction: reaction,
  })

  return toDataResponse<ReactToCommentResponse['data']>(
    response,
    'react to comment'
  )
}

export const feedsApi = {
  view: viewFeed,
  get: getFeed,
  getInfo: getFeedInfo,
  viewRemote: viewRemoteFeed,
  getPost,
  create: createFeed,
  find: getFindFeeds,
  search: searchFeeds,
  subscribe: subscribeToFeed,
  unsubscribe: unsubscribeFromFeed,
  getNewPostForm,
  createPost,
  reactToPost,
  getNewCommentForm,
  createComment,
  reactToComment,
}

export default feedsApi
