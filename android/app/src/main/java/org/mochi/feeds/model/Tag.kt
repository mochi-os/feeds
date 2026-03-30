package org.mochi.feeds.model

data class Tag(
    val id: String = "",
    val label: String = "",
    val qid: String? = null,
    val source: String? = null,
    val relevance: Double? = null,
    val interest: Double? = null
)
