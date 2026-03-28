package org.mochi.feeds.model

data class Source(
    val id: String = "",
    val feed: String = "",
    val type: String = "",
    val url: String = "",
    val name: String = "",
    val credibility: Double = 0.0,
    val interval: Int = 0,
    val fetched: Long = 0,
    val transform: String = ""
)
