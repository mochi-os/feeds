import { useQuery } from '@tanstack/react-query'
import endpoints from '@/api/endpoints'
import type { FeedInfoResponse } from '@/types'
import { requestHelpers } from '@mochi/common'

export function useFeedInfo() {
  return useQuery({
    queryKey: ['feed', 'info'],
    queryFn: () => requestHelpers.get<FeedInfoResponse>(endpoints.feeds.info),
  })
}
