package com.example.arena_set_cracker.persistence.model

import com.example.arena_set_cracker.api.model.Color
import com.example.arena_set_cracker.api.model.Deck
import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "decks")
data class DeckEntity(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Int? = null,

    @Column(nullable = false)
    val name: String,

    val arenaDeck: String,

    val set: Int,

    @ElementCollection(targetClass = Color::class)
    @CollectionTable(name = "decks_colors", joinColumns = [JoinColumn(name = "deck_id")])
    @Enumerated(EnumType.STRING)
    @Column(name = "color")
    val colors: Set<Color> = emptySet(),

    @ElementCollection
    @CollectionTable(name = "decks_cards", joinColumns = [JoinColumn(name = "deck_id")])
    @MapKeyColumn(name = "card_name")
    @Column(name = "quantity")
    val cards: Map<String, Int> = emptyMap(),

    @ElementCollection
    @CollectionTable(name = "decks_tags", joinColumns = [JoinColumn(name = "deck_id")])
    @Column(name = "tag")
    val tags: Set<String> = emptySet(),

    val notes: String = "",

    val createdAt: Instant? = null
) {
    fun toDomain(): Deck = Deck(id, name, arenaDeck, tags, notes)
}