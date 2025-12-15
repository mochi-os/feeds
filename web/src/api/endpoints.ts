const endpoints = {
  feeds: {
    list: '/list',
    get: (feedId: string) => `${feedId}`,
    getPost: (feedId: string, postId: string) => `${feedId}/${postId}`,
    create: '/create',
    find: '/find',
    search: '/search',
    new: '/new',
    subscribe: '/subscribe',
    unsubscribe: '/unsubscribe',
    post: {
      new: '/post/new',
      newInFeed: (feedId: string) => `${feedId}/post`,
      create: '/post/create',
      createInFeed: (feedId: string) => `${feedId}/create`,
      react: '/post/react',
    },
    comment: {
      new: (feed: string, post: string) => `${feed}/${post}/comment`,
      create: '/comment/create',
      react: '/comment/react',
    },
  },
} as const

export type Endpoints = typeof endpoints

export default endpoints
