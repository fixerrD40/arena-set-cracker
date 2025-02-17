package com.example.arena_vendor.deck

import com.example.arena_vendor.api.model.Deck
import org.springframework.stereotype.Component

@Component
class DeckService(
    private val dao: DeckDAO
) {

    fun getDecks() = dao.decks()
    fun getDeckNames() = dao.deckNames()

    fun getDeck(name: String): Deck? = dao.deck(name)

    fun insertDeck(deck: Deck): Boolean = dao.insertDeck(deck)

    fun deleteDeck(name: String): Boolean = dao.deleteDeck(name)
}