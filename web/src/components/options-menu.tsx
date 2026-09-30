// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  OptionsMenu as SharedOptionsMenu,
  handleServerError,
} from '@mochi/web'
import { Bell } from 'lucide-react'
import { feedsApi } from '@/api/feeds'

interface OptionsMenuProps {
  entityId?: string
  showRss?: boolean
  onSources?: () => void
  onSettings?: () => void
  onUnsubscribe?: () => void
  unsubscribePending?: boolean
  /** Show 'Copy invite link' - owner only (the share action is owner-gated). */
  canShare?: boolean
  /** A feed the user holds, whose notification switches the menu offers. */
  notificationsFeed?: string
}

const createShareLink = async (entityId: string) =>
  (await feedsApi.share(entityId)).data.link

const createRssToken = async (entity: string, mode: 'posts' | 'all') =>
  (await feedsApi.getRssToken(entity, mode)).token

const revokeRssToken = async (entity: string) => {
  await feedsApi.revokeRssToken(entity)
}

// A feed's notification switches. Read with the page as well as by the
// submenu, so the submenu opens with its ticks already in place.
function useNotifications(feedId: string | undefined) {
  return useQuery({
    queryKey: ['feeds', 'notifications', feedId],
    queryFn: () => feedsApi.getNotifications(feedId!),
    enabled: !!feedId,
    refetchOnWindowFocus: false,
  })
}

// Binds the feeds api and routing to the shared entity menu.
export function OptionsMenu({ notificationsFeed, ...props }: OptionsMenuProps) {
  useNotifications(notificationsFeed)
  return (
    <SharedOptionsMenu
      {...props}
      linkTitle={<Trans>Feed link</Trans>}
      createShareLink={createShareLink}
      createRssToken={createRssToken}
      revokeRssToken={revokeRssToken}
    >
      {notificationsFeed && <NotificationsMenu feedId={notificationsFeed} />}
    </SharedOptionsMenu>
  )
}

function NotificationsMenu({ feedId }: { feedId: string }) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const { data } = useNotifications(feedId)
  const setNotification = useMutation({
    mutationFn: (enabled: boolean) =>
      feedsApi.setNotification(feedId, 'post', enabled),
    onSuccess: (response) =>
      queryClient.setQueryData(['feeds', 'notifications', feedId], response),
    onError: handleServerError,
  })
  const settings = data?.data

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Bell className='me-2 size-4' />
        <Trans>Notifications</Trans>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuCheckboxItem
          checked={settings?.post ?? false}
          disabled={!settings}
          // Stay open so the change can be seen.
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={(checked) => setNotification.mutate(checked)}
        >
          {t`New posts`}
        </DropdownMenuCheckboxItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
