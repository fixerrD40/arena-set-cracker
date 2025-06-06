package com.example.arena_vendor.api.model

import com.example.arena_vendor.logging.Mdcs
import com.example.arena_vendor.persistence.model.DeckEntity
import java.time.Instant

data class Deck(
    val id: Int? = null,
    val name: String,
    val arenaDeck: String,
    val identity: ColorIdentity,
    val cards: Map<String, Int>,
    val tags: Set<String> = emptySet(),
    val notes: String? = null,
    val createdAt: Instant? = null
) {

    fun toEntity(): DeckEntity = DeckEntity(
        id = id,
        name = name,
        arenaDeck = arenaDeck,
        colors = identity.colors,
        set = Mdcs.RequestContext.set,
        cards = cards,
        tags = tags,
        notes = notes,
        createdAt = createdAt
    )
}