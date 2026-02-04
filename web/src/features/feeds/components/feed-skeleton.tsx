import { Skeleton, Card, CardContent } from '@mochi/common'

export function FeedSkeleton() {
  return (
    <div className='flex flex-col gap-4'>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className='overflow-hidden'>
          <CardContent className='p-4 sm:p-6'>
            <div className='flex gap-3 sm:gap-4'>
              <Skeleton className='size-10 shrink-0 rounded-full' />
              <div className='flex-1 space-y-2'>
                <div className='flex items-center justify-between'>
                  <Skeleton className='h-4 w-24' />
                  <Skeleton className='h-4 w-12' />
                </div>
                <Skeleton className='h-4 w-3/4' />
                <div className='space-y-1 pt-2'>
                  <Skeleton className='h-3 w-full' />
                  <Skeleton className='h-3 w-5/6' />
                </div>
                <div className='flex gap-2 pt-2'>
                  <Skeleton className='h-8 w-16 rounded-full' />
                  <Skeleton className='h-8 w-16 rounded-full' />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
