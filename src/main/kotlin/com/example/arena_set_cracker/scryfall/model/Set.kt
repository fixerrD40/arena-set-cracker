package com.example.arena_set_cracker.scryfall.model

data class Set(
    val id: String,
    val code: String,
    val name: String,
    val released_at: String?,
    val set_type: String,
    val card_count: Int,
    val digital: Boolean,
    val parent_set_code: String?,
    val icon_svg_uri: String
)