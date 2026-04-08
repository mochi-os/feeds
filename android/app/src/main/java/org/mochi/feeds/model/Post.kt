package org.mochi.feeds.model

import com.google.gson.annotations.SerializedName
import org.mochi.android.model.Attachment
import org.mochi.android.model.Comment
import org.mochi.android.model.PlaceData
import org.mochi.android.model.Reaction

data class Post(
    val id: String = "",
    val feed: String = "",
    @SerializedName("feed_fingerprint") val feedFingerprint: String = "",
    @SerializedName("feed_name") val feedName: String = "",
    val body: String = "",
    @SerializedName("body_markdown") val bodyMarkdown: String = "",
    val data: PostData? = null,
    val created: Long = 0,
    @SerializedName("created_string") val createdString: String = "",
    val updated: Long = 0,
    val attachments: List<Attachment> = emptyList(),
    @SerializedName("my_reaction") val myReaction: String = "",
    val reactions: List<Reaction> = emptyList(),
    val comments: List<Comment> = emptyList(),
    val tags: List<Tag> = emptyList(),
    val up: Int = 0,
    val down: Int = 0,
    val read: Long = 0,
    val source: PostSource? = null,
    val score: Double? = null
)

data class PostData(
    val checkin: PlaceData? = null,
    val travelling: TravellingData? = null,
    val memory: MemoryData? = null,
    val rss: RssData? = null
)

data class RssData(
    val html: String = "",
    val image: String = "",
    val link: String = "",
    val source: String = "",
    val title: String = ""
)

data class TravellingData(
    val origin: PlaceData? = null,
    val destination: PlaceData? = null
)

data class MemoryData(
    @SerializedName("years_ago") val yearsAgo: Int = 0
)

data class PostSource(
    val name: String = "",
    val url: String = ""
)
