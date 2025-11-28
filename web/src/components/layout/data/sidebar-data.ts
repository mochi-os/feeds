import { getPath } from '@mochi/config/routes'
import {
  MessagesSquare,
  AudioWaveform,
  Bell,
  Command,
  GalleryVerticalEnd,
  Home,
  Newspaper,
  UserPlus,
  MessageSquare,
  LayoutTemplate,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'satnaing',
    email: 'satnaingdev@gmail.com',
    avatar: '/avatars/shadcn.jpg',
  },
  teams: [
    {
      name: 'Mochi OS',
      logo: Command,
      plan: 'Vite + ShadcnUI',
    },
    {
      name: 'Acme Inc',
      logo: GalleryVerticalEnd,
      plan: 'Enterprise',
    },
    {
      name: 'Acme Corp.',
      logo: AudioWaveform,
      plan: 'Startup',
    },
  ],
  navGroups: [
    {
      title: 'Apps',
      items: [
        {
          title: 'Home',
          url: getPath('home'),
          icon: Home,
          external: true,
        },
        {
          title: 'Chat',
          url: getPath('chat'),
          icon: MessagesSquare,
          external: true,
        },
        {
          title: 'Friends',
          url: getPath('friends'),
          icon: UserPlus,
          external: true,
        },
        {
          title: 'Notifications',
          url: getPath('notifications'),
          icon: Bell,
          external: true,
        },
        {
          title: 'Feeds',
          url: './',
          icon: Newspaper,
        },
        {
          title: 'Forums',
          url: getPath('forums'),
          icon: MessageSquare,
          external: true,
        },
        {
          title: 'Template',
          url: '/template/',
          icon: LayoutTemplate,
          external: true,
        },
      ],
    },
  ],
}
