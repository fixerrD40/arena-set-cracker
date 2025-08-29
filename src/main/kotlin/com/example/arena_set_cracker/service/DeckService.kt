package com.example.arena_set_cracker.service

import com.example.arena_set_cracker.api.model.Deck
import com.example.arena_set_cracker.persistence.DeckRepository
import com.example.arena_set_cracker.persistence.model.DeckEntity
import org.springframework.stereotype.Component
import kotlin.jvm.optionals.getOrNull

@Component
class DeckService(
    private val dao: DeckRepository
) {

    fun getDeckSet(deck: Int): Int? = dao.findById(deck).getOrNull()?.set

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
            DeckEntity(
                name = deck.name,
                raw = deck.raw,
                // I think making this brittle is good
                set = set!!,
                primaryColor = deck.identity.primary,
                colors = deck.identity.colors,
                cards = parseDeck(deck.raw),
                tags = deck.tags,
                notes = deck.notes
            )
        } else {
            val cards = if (existing.raw == deck.raw) existing.cards else parseDeck(deck.raw)
            DeckEntity(
                existing.id,
                deck.name,
                deck.raw,
                existing.set,
                deck.identity.primary,
                deck.identity.colors,
                cards,
                deck.tags,
                deck.notes,
                existing.createdAt
            )
        }
    }

    // TODO
    private fun parseDeck(raw: String): Map<String, Int> {
        return emptyMap()
    }

    fun getDeckWithColors(deckId: Int): DeckEntity {
        return dao.findByIdWithColors(deckId)
            ?: throw IllegalArgumentException("Deck with ID $deckId not found.")
    }
}