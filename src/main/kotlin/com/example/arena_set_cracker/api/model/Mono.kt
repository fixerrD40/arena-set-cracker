package com.example.arena_set_cracker.api.model

enum class Mono(
    override val colors: Set<Color>
) : ColorIdentity {
    White(setOf(Color.W)),
    Blue(setOf(Color.U)),
    Black(setOf(Color.B)),
    Red(setOf(Color.R)),
    Green(setOf(Color.G));
}