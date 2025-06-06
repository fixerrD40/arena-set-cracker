package com.example.arena_set_cracker.service

import com.example.arena_set_cracker.api.model.*
import com.example.arena_set_cracker.persistence.DeckRepository
import org.springframework.stereotype.Component

@Component
class DeckService(
    private val dao: DeckRepository
) {

    fun getDecks(): List<Deck> = dao.findAll().map { it.toDomain() }

    fun getDeck(id: Int): Deck = dao.findById(id).get().toDomain()

    fun saveDeck(deck: Deck): Deck = dao.save(deck.toEntity()).toDomain()

    fun deleteDeck(id: Int) = dao.deleteById(id)
}