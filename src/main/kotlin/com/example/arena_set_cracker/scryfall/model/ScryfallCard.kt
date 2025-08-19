package com.example.arena_set_cracker.scryfall.model

import com.fasterxml.jackson.annotation.JsonProperty

data class ScryfallCard(
    val name: String,
    val rarity: String,
    @JsonProperty("color_identity")
    val colorIdentity: List<String> = listOf(),
    @JsonProperty("type_line")
    val typeLine: String = "",
    @JsonProperty("oracle_text")
    val oracleText: String = "",
    val keywords: List<String> = listOf()
)