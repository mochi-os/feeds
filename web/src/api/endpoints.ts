const endpoints = {
  feeds: {
    list: '/feeds/list',
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
      create: '/feeds/post/create',
      createInFeed: (feedId: string) => `/feeds/${feedId}/create`,
      react: (feed: string, post: string, reaction: string) =>
        `/feeds/${feed}/${post}/react/${reaction}`,
    },
    comment: {
      new: (feed: string, post: string) => `/feeds/${feed}/${post}/comment`,
      create: (feed: string, post: string) => `/feeds/${feed}/${post}/create`,
      react: (feed: string, post: string, comment: string, reaction: string) =>
        `/feeds/${feed}/${post}/${comment}/react/${reaction}`,
    },
  },
  auth: {
    login: '/login',
    signup: '/signup',
    verify: '/login/auth',
    logout: '/logout',
  },
} as const

export type Endpoints = typeof endpoints

export default endpoints
