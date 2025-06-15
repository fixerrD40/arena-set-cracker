package com.example.arena_set_cracker.service

import com.example.arena_set_cracker.api.model.Color
import com.example.arena_set_cracker.api.model.Deck
import com.example.arena_set_cracker.logging.Mdcs
import com.example.arena_set_cracker.persistence.DeckRepository
import com.example.arena_set_cracker.persistence.model.DeckEntity
import org.springframework.stereotype.Component
import java.time.Instant

@Component
class DeckService(
    private val dao: DeckRepository
) {

    fun getDecks(): List<Deck> = dao.findAllBySet(Mdcs.RequestContext.set!!).map { it.toDomain() }

    /**
     * A new deck needs to be saved within the context of a set.
     * See [Mdcs.SET]
     */
    fun saveDeck(deck: Deck): Deck {
        val entity = populateEntity(deck)

        return dao.save(entity).toDomain()
    }

    fun deleteDeck(deck: Int) = dao.deleteById(deck)

    private fun populateEntity(deck: Deck): DeckEntity {
        val existing = deck.id?.let {
            dao.findById(it).get()
        }

        // I think making this brittle is good
        val set = existing?.set ?: Mdcs.RequestContext.set!!
        val createdAt = existing?.createdAt ?: Instant.now()
        val (colors, cards) = parseDeck(deck.arenaDeck)

        return DeckEntity(
            deck.id,
            deck.name,
            deck.arenaDeck,
            set,
            colors,
            cards,
            deck.tags,
            deck.notes,
            createdAt
        )
    }

    // TODO
    private fun parseDeck(arenaDeck: String): Pair<Set<Color>, Map<String, Int>> {
        return Pair(setOf(Color.R), emptyMap())
    }
}