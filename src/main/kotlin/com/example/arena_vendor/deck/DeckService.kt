package com.example.arena_vendor.deck

import com.example.arena_vendor.api.model.Deck
import org.springframework.stereotype.Component

@Component
class DeckService(
    private val dao: DeckDAO
) {

    fun getDecks() = dao.decks()
    fun getDeckNames() = dao.deckNames()

    fun getDeck(id: Int): Deck? = dao.deck(id)

    fun insertDeck(deck: Deck): Boolean = dao.insertDeck(deck)

    fun deleteDeck(id: Int): Boolean = dao.deleteDeck(id)
}