const endpoints = {
  feeds: {
    list: '/feeds/list',
    create: '/feeds/create',
    find: '/feeds/find',
    search: '/feeds/search',
    new: '/feeds/new',
    subscribe: '/feeds/subscribe',
    unsubscribe: '/feeds/unsubscribe',
    post: {
      new: '/feeds/post/new',
      create: '/feeds/post/create',
      react: '/feeds/post/react',
    },
    comment: {
      new: '/feeds/comment/new',
      create: '/feeds/comment/create',
      react: '/feeds/comment/react',
    },
  },
} as const

export type Endpoints = typeof endpoints

export default endpoints
