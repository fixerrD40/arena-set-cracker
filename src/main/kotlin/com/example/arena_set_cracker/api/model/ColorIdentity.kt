package com.example.arena_set_cracker.api.model

data class ColorIdentity (val primary: Color, val colors: Set<Color>)

enum class Color(val displayName: String) {
    W("White"),
    U("Blue"),
    B("Black"),
    R("Red"),
    G("Green");

    companion object {
        fun fromDisplayName(name: String): Color? =
            entries.firstOrNull { it.displayName.equals(name, ignoreCase = true) }
    }
}

sealed interface Colors {
    val colors: Set<Color>

    companion object {
        fun fromSet(colors: Set<Color>): Colors {
            return when (colors.size) {
                1 -> {
                    Mono.entries.first { it.colors == colors }
                }

                2 -> Dual.entries.firstOrNull { it.colors.toSet() == colors }
                    ?: throw IllegalArgumentException("No matching identity for colors: $colors")

                3 -> Tri.entries.firstOrNull { it.colors.toSet() == colors }
                    ?: throw IllegalArgumentException("No matching identity for colors: $colors")

                else -> throw IllegalArgumentException("Unsupported color identity: $colors")
            }
        }
    }
}