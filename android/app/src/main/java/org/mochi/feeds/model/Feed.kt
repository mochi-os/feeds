package org.mochi.feeds.model

import com.google.gson.annotations.SerializedName

data class Feed(
    val id: String = "",
    val fingerprint: String = "",
    val name: String = "",
    val privacy: String = "private",
    val owner: Int = 0,
    val subscribers: Int = 0,
    val updated: Long = 0,
    val server: String? = null,
    val read: Int = 0,
    val unread: Int = 0,
    @SerializedName("ai_mode") val aiMode: String? = null,
    val sort: String = ""
)

data class Permissions(
    val view: Boolean = false,
    val react: Boolean = false,
    val comment: Boolean = false,
    val manage: Boolean = false
)
