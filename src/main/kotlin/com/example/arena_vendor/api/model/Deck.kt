package com.example.arena_vendor.api.model

import java.time.Instant
import java.time.LocalDateTime

// add user and set
data class Deck(
    val id: Int?,
    val name: String,
    val arenaDeck: String,
    val identity: ColorIdentity,
//    val user: String,
//    val set: String,
    val cards: Map<String, Int>,
    val tags: Set<String> = emptySet(),
    val notes: String? = null,
    val createdAt: Instant?
) {
//    val cards = arenaDeck.lines()
//        .mapNotNull { line ->
//            val trimmed = line.trim()
//            val parts = trimmed.split(" ", limit = 2)
//            if (parts.size == 2) {
//                val count = parts[0].toIntOrNull()
//                val name = parts[1]
//                if (count != null) name to count else null
//            } else null
//        }.toMap()
}