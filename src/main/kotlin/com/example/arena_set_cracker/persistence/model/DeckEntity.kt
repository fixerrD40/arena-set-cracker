package com.example.arena_set_cracker.persistence.model

import com.example.arena_set_cracker.api.model.Color
import com.example.arena_set_cracker.api.model.ColorIdentity
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

    val raw: String,

    @Column(nullable = false)
    val set: Int,

    @Enumerated(EnumType.STRING)
    val primaryColor: Color,

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

    val createdAt: Instant? = Instant.now()
) {
    fun toDomain(): Deck = Deck(id, name, ColorIdentity(primaryColor, colors), raw, tags, notes)
}