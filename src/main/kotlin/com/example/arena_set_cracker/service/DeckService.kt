package com.example.arena_set_cracker.service

import com.example.arena_set_cracker.api.model.Color
import com.example.arena_set_cracker.api.model.Deck
import com.example.arena_set_cracker.persistence.DeckRepository
import com.example.arena_set_cracker.persistence.model.DeckEntity
import org.springframework.stereotype.Component

@Component
class DeckService(
    private val dao: DeckRepository
) {

    fun getDecks(set: Int): List<Deck> = dao.findAllBySet(set).map { it.toDomain() }

    fun saveDeck(deck: Deck, set: Int? = null): Deck {
        val entity = populateEntity(set, deck)

        return dao.save(entity).toDomain()
    }

    fun deleteDeck(deck: Int) = dao.deleteById(deck)

    private fun populateEntity(set: Int?, deck: Deck): DeckEntity {
        val existing = deck.id?.let {
            dao.findById(it).get()
        }

        return if (existing == null) {
            val (colors, cards) = parseDeck(deck.raw)
            DeckEntity(
                name = deck.name,
                raw = deck.raw,
                // I think making this brittle is good
                set = set!!,
                colors = colors,
                cards = cards,
                tags = deck.tags,
                notes = deck.notes
            )
        } else {
            val (colors, cards) = if (existing.raw == deck.raw) existing.colors to existing.cards else parseDeck(deck.raw)
            DeckEntity(
                existing.id,
                deck.name,
                deck.raw,
                existing.set,
                colors,
                cards,
                deck.tags,
                deck.notes,
                existing.createdAt
            )
        }
    }

    // TODO
    private fun parseDeck(raw: String): Pair<Set<Color>, Map<String, Int>> {
        return Pair(setOf(Color.R), emptyMap())
    }
}