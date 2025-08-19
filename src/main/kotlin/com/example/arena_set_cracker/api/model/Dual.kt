package com.example.arena_set_cracker.api.model

enum class Dual(
    override val colors: Set<Color>
) : Colors {
    AZORIUS(setOf(Color.W, Color.U)),
    DIMIR(setOf(Color.U, Color.B)),
    RAKDOS(setOf(Color.B, Color.R)),
    GRUUL(setOf(Color.R, Color.G)),
    SELESNYA(setOf(Color.G, Color.W)),
    ORZHOV(setOf(Color.W, Color.B)),
    IZZET(setOf(Color.U, Color.R)),
    GOLGARI(setOf(Color.B, Color.G)),
    BOROS(setOf(Color.R, Color.W)),
    SIMIC(setOf(Color.G, Color.U));

    fun displayName(): String =
        name.lowercase().replaceFirstChar { it.uppercase() }
}