package com.example.arena_set_cracker.scryfall.model

import com.fasterxml.jackson.annotation.JsonProperty

data class CardListResponse(
    val data: List<ScryfallCard>,

    @JsonProperty("has_more")
    val hasMore: Boolean,

    @JsonProperty("next_page")
    val nextPage: String?
)