package com.example.arena_set_cracker.api.model

enum class Tri(
    override val colors: Set<Color>
) : Colors {
    BANT(setOf(Color.W, Color.U, Color.G)),
    ESPER(setOf(Color.U, Color.W, Color.B)),
    JUND(setOf(Color.R, Color.G, Color.B)),
    NAYA(setOf(Color.G, Color.R, Color.W)),
    GRIXIS(setOf(Color.B, Color.U, Color.R)),
    MARDU(setOf(Color.W, Color.B, Color.R)),
    TEMUR(setOf(Color.U, Color.R, Color.G)),
    ABZAN(setOf(Color.B, Color.W, Color.G)),
    JESKAI(setOf(Color.R, Color.W, Color.U)),
    SULTAI(setOf(Color.G, Color.B, Color.U));

    fun displayName(): String =
        name.lowercase().replaceFirstChar { it.uppercase() }
}