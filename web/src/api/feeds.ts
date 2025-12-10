import endpoints from '@/api/endpoints'
import type {
  CreateCommentRequest,
  CreateCommentResponse,
  GetNewCommentParams,
  GetNewCommentResponse,
  ReactToCommentRequest,
  ReactToCommentResponse,
} from '@/api/types/comments'
import type {
  CreateFeedRequest,
  CreateFeedResponse,
  FindFeedsResponse,
  GetNewFeedResponse,
  SearchFeedsParams,
  SearchFeedsResponse,
  SubscribeFeedRequest,
  SubscribeFeedResponse,
  UnsubscribeFeedRequest,
  UnsubscribeFeedResponse,
  ViewFeedParams,
  ViewFeedResponse,
} from '@/api/types/feeds'
import type {
  CreatePostRequest,
  CreatePostResponse,
  GetNewPostParams,
  GetNewPostResponse,
  ReactToPostRequest,
  ReactToPostResponse,
} from '@/api/types/posts'
import { requestHelpers } from '@/lib/request'

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
  const response = await requestHelpers.get<
    ViewFeedResponse | ViewFeedResponse['data']
  >(endpoints.feeds.list, {
    params: omitUndefined({
      feed: params?.feed,
      post: params?.post,
    }),
  })

  return toDataResponse<ViewFeedResponse['data']>(response, 'view feeds')
}

const getFeed = async (
  id: string,
  params?: Record<string, string | number>
): Promise<ViewFeedResponse> => {
  const response = await requestHelpers.get<
    ViewFeedResponse | ViewFeedResponse['data']
  >(endpoints.feeds.get(id), {
    params,
  })

  return toDataResponse<ViewFeedResponse['data']>(response, 'view feed')
}

const getPost = async (
  feedId: string,
  postId: string
): Promise<ViewFeedResponse> => {
  const response = await requestHelpers.get<
    ViewFeedResponse | ViewFeedResponse['data']
  >(endpoints.feeds.getPost(feedId, postId))

  return toDataResponse<ViewFeedResponse['data']>(response, 'view post')
}

const createFeed = async (
  payload: CreateFeedRequest
): Promise<CreateFeedResponse> => {
  const response = await requestHelpers.post<
    CreateFeedResponse | CreateFeedResponse['data'],
    CreateFeedRequest
  >(endpoints.feeds.create, payload)

  return toDataResponse<CreateFeedResponse['data']>(response, 'create feed')
}

const getFindFeeds = async (): Promise<FindFeedsResponse> => {
  const response = await requestHelpers.get<
    FindFeedsResponse | FindFeedsResponse['data']
  >(endpoints.feeds.find)

  return toDataResponse<FindFeedsResponse['data']>(response, 'find feeds')
}

const searchFeeds = async (
  params: SearchFeedsParams
): Promise<SearchFeedsResponse> => {
  const response = await requestHelpers.get<
    SearchFeedsResponse | SearchFeedsResponse['data']
  >(endpoints.feeds.search, {
    params: { search: params.search },
  })

  return toDataResponse<SearchFeedsResponse['data']>(response, 'search feeds')
}

const getNewFeed = async (): Promise<GetNewFeedResponse> => {
  const response = await requestHelpers.get<
    GetNewFeedResponse | GetNewFeedResponse['data']
  >(endpoints.feeds.new)

  return toDataResponse<GetNewFeedResponse['data']>(response, 'new feed form')
}

const subscribeToFeed = async (
  feedId: string
): Promise<SubscribeFeedResponse> => {
  console.log('[API] subscribeToFeed called with feedId:', feedId)
  const url = endpoints.feeds.subscribe(feedId)
  console.log('[API] Making POST request to:', url)

  try {
    const response = await requestHelpers.post<
      SubscribeFeedResponse | SubscribeFeedResponse['data'],
      undefined
    >(url, undefined)

    console.log('[API] subscribeToFeed response received:', response)
    const result = toDataResponse<SubscribeFeedResponse['data']>(
      response,
      'subscribe to feed'
    )
    console.log('[API] subscribeToFeed returning:', result)
    return result
  } catch (error) {
    console.error('[API] subscribeToFeed error:', error)
    throw error
  }
}

const unsubscribeFromFeed = async (
  feedId: string
): Promise<UnsubscribeFeedResponse> => {
  console.log('[API] unsubscribeFromFeed called with feedId:', feedId)
  const url = endpoints.feeds.unsubscribe(feedId)
  console.log('[API] Making POST request to:', url)

  try {
    const response = await requestHelpers.post<
      UnsubscribeFeedResponse | UnsubscribeFeedResponse['data'],
      undefined
    >(url, undefined)

    console.log('[API] unsubscribeFromFeed response received:', response)
    const result = toDataResponse<UnsubscribeFeedResponse['data']>(
      response,
      'unsubscribe from feed'
    )
    console.log('[API] unsubscribeFromFeed returning:', result)
    return result
  } catch (error) {
    console.error('[API] unsubscribeFromFeed error:', error)
    throw error
  }
}

const getNewPostForm = async (
  params?: GetNewPostParams
): Promise<GetNewPostResponse> => {
  const response = await requestHelpers.get<
    GetNewPostResponse | GetNewPostResponse['data']
  >(endpoints.feeds.post.new, {
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

  if (payload.attachment) {
    formData.append('files', payload.attachment)
  }

  const response = await requestHelpers.post<
    CreatePostResponse | CreatePostResponse['data'],
    FormData
  >(endpoints.feeds.post.create, formData)

  return toDataResponse<CreatePostResponse['data']>(response, 'create post')
}

// Create post using the specific feed endpoint (application/json, no attachments)
const createPostInFeed = async (
  feedId: string,
  body: string
): Promise<CreatePostResponse> => {
  const response = await requestHelpers.post<
    CreatePostResponse | CreatePostResponse['data'],
    { body: string }
  >(endpoints.feeds.post.createInFeed(feedId), { body })

  return toDataResponse<CreatePostResponse['data']>(response, 'create post in feed')
}

const reactToPost = async (
  payload: ReactToPostRequest
): Promise<ReactToPostResponse> => {
  const response = await requestHelpers.post<
    ReactToPostResponse | ReactToPostResponse['data'],
    undefined
  >(
    endpoints.feeds.post.react(
      payload.feed,
      payload.post,
      payload.reaction
    ),
    undefined
  )

  return toDataResponse<ReactToPostResponse['data']>(response, 'react to post')
}

const getNewCommentForm = async (
  params: GetNewCommentParams
): Promise<GetNewCommentResponse> => {
  const response = await requestHelpers.get<
    GetNewCommentResponse | GetNewCommentResponse['data']
  >(endpoints.feeds.comment.new(params.feed, params.post), {
    params: omitUndefined({
      parent: params.parent,
    }),
  })

  return toDataResponse<GetNewCommentResponse['data']>(
    response,
    'new comment form'
  )
}

const createComment = async (
  payload: CreateCommentRequest
): Promise<CreateCommentResponse> => {
  const response = await requestHelpers.post<
    CreateCommentResponse | CreateCommentResponse['data'],
    Pick<CreateCommentRequest, 'body' | 'parent'>
  >(endpoints.feeds.comment.create(payload.feed, payload.post), {
    body: payload.body,
    parent: payload.parent,
  })

  return toDataResponse<CreateCommentResponse['data']>(
    response,
    'create comment'
  )
}

const reactToComment = async (
  payload: ReactToCommentRequest
): Promise<ReactToCommentResponse> => {
  const response = await requestHelpers.post<
    ReactToCommentResponse | ReactToCommentResponse['data'],
    undefined
  >(
    endpoints.feeds.comment.react(
      payload.feed,
      payload.post,
      payload.comment,
      payload.reaction
    ),
    undefined
  )

  return toDataResponse<ReactToCommentResponse['data']>(
    response,
    'react to comment'
  )
}

export const feedsApi = {
  view: viewFeed,
  get: getFeed,
  getPost,
  create: createFeed,
  find: getFindFeeds,
  search: searchFeeds,
  getNewFeed,
  subscribe: subscribeToFeed,
  unsubscribe: unsubscribeFromFeed,
  getNewPostForm,
  createPost,
  createPostInFeed,
  reactToPost,
  getNewCommentForm,
  createComment,
  reactToComment,
}

export type {
  CreateCommentRequest,
  CreateCommentResponse,
  CreateFeedRequest,
  CreateFeedResponse,
  CreatePostRequest,
  CreatePostResponse,
  FindFeedsResponse,
  GetNewCommentParams,
  GetNewCommentResponse,
  GetNewFeedResponse,
  GetNewPostParams,
  GetNewPostResponse,
  ReactToCommentRequest,
  ReactToCommentResponse,
  ReactToPostRequest,
  ReactToPostResponse,
  SearchFeedsParams,
  SearchFeedsResponse,
  SubscribeFeedRequest,
  SubscribeFeedResponse,
  UnsubscribeFeedRequest,
  UnsubscribeFeedResponse,
  ViewFeedParams,
  ViewFeedResponse,
}

export default feedsApi
