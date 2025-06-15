package com.example.arena_set_cracker.api.model

import com.example.arena_set_cracker.persistence.model.DeckEntity

data class Deck(
    val id: Int? = null,
    val name: String,
    val arenaDeck: String,
    val tags: Set<String> = emptySet(),
    val notes: String = "",
) {

    fun toEntityForSet(set: Int): DeckEntity = DeckEntity(
        id = id,
        name = name,
        arenaDeck = arenaDeck,
        set = set,
        tags = tags,
        notes = notes,
    )
}