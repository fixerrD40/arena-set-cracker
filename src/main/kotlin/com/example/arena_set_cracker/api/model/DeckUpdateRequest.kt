package com.example.arena_set_cracker.api.model

data class DeckUpdateRequest(
    val name: String? = null,
    val arenaDeck: String? = null,
    val tags: Set<String>? = null,
    val notes: String? = null
)