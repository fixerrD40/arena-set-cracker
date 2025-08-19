package com.example.arena_set_cracker.scryfall.model

data class CardListResponse(
    val data: List<ScryfallCard>,
    val has_more: Boolean,
    val next_page: String?
)