package com.example.arena_vendor.api.model

import com.example.arena_vendor.persistence.model.DeckEntity
import java.time.Instant

// todo support user and set
data class Deck(
    val id: Int? = null,
    val name: String,
    val arenaDeck: String,
    val identity: ColorIdentity,
//    val user: String,
//    val set: String,
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
        cards = cards,
        tags = tags,
        notes = notes,
        createdAt = createdAt
    )
}