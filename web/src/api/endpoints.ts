const endpoints = {
  feeds: {
    list: '/list',
    get: (feedId: string) => `/feeds/${feedId}`,
    getPost: (feedId: string, postId: string) => `/feeds/${feedId}/${postId}`,
    create: '/feeds/create',
    find: '/feeds/find',
    search: '/feeds/search',
    new: '/feeds/new',
    subscribe: (feedId: string) => `/feeds/${feedId}/subscribe`,
    unsubscribe: (feedId: string) => `/feeds/${feedId}/unsubscribe`,
    post: {
      new: '/feeds/post/new',
      newInFeed: (feedId: string) => `/feeds/post/${feedId}/post`,
      create: '/feeds/post/create',
      createInFeed: (feedId: string) => `/feeds/post/${feedId}/create`,
      react: (feed: string, post: string, reaction: string) =>
        `/feeds/post/${feed}/${post}/react/${reaction}`,
    },
    comment: {
      new: (feed: string, post: string) => `/feeds/post/${feed}/${post}/comment`,
      create: '/feeds/comment/create',
      react: '/feeds/comment/react',
    },
  },
} as const

export type Endpoints = typeof endpoints

export default endpoints
