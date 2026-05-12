package org.mochios.feeds

import android.content.Context
import android.net.Uri
import org.mochios.android.push.MochiPushReceiver

/**
 * Concrete UnifiedPush receiver for Feeds. Posts system notifications
 * with a tap intent into the existing `mochi-feeds://` scheme handler.
 */
class FeedsPushReceiver : MochiPushReceiver() {

    override fun channelId(context: Context, instance: String): String =
        FeedsApplication.NOTIFICATION_CHANNEL_ID

    override fun deepLinkFor(context: Context, instance: String, link: String): Uri =
        Uri.parse("mochi-feeds://notification")
            .buildUpon()
            .appendQueryParameter("link", link)
            .build()

    override fun appName(): String = "feeds"
}
