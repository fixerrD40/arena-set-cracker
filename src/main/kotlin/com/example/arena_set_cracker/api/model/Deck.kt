package com.example.arena_set_cracker.api.model

import com.example.arena_set_cracker.persistence.model.DeckEntity

data class Deck(
    val id: Int? = null,
    val name: String,
    val identity: ColorIdentity,
    val raw: String,
    val tags: Set<String> = emptySet(),
    val notes: String = "",
) {

    fun toEntityForSet(set: Int): DeckEntity = DeckEntity(
        id = id,
        name = name,
        primaryColor = identity.primary,
        colors = identity.colors,
        raw = raw,
        set = set,
        tags = tags,
        notes = notes,
    )
}