package com.example.arena_set_cracker.scryfall.model

import com.fasterxml.jackson.annotation.JsonProperty

data class SetListResponse(
    @JsonProperty("object")
    val objectType: String,
    val total_cards: Int,
    val has_more: Boolean,
    val data: List<ScryfallSet>
)