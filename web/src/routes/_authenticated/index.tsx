import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@mochi/common'
import { Feeds } from '@/features/feeds'

export const Route = createFileRoute('/_authenticated/')({
  component: HomePage,
})

function HomePage() {
  usePageTitle('Feeds')
  return <Feeds />
}

