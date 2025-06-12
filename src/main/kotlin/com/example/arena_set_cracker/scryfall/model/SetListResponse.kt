package com.example.arena_set_cracker.scryfall.model

data class SetListResponse(
    val objectType: String,
    val total_cards: Int,
    val has_more: Boolean,
    val data: List<Set>
)