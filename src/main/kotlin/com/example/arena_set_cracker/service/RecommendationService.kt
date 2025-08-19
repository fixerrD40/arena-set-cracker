package com.example.arena_set_cracker.service

import com.example.arena_set_cracker.persistence.DeckRepository
import com.example.arena_set_cracker.persistence.SetRepository
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Service
import java.io.BufferedWriter
import java.io.OutputStreamWriter
import java.util.concurrent.TimeUnit
import kotlin.coroutines.cancellation.CancellationException

@Service
class RecommendationService(
    private val deckRepo: DeckRepository,
    private val setRepo: SetRepository,
    private val scryfall: CachedScryfallService,
    private val objectMapper: ObjectMapper
) {

    fun scoreCardsWithPython(deckId: Int): String {
        val processBuilder = ProcessBuilder("python3", "score_cards.py")
        val process = processBuilder.start()

        val deck = deckRepo.findById(deckId).get()
        val primaryColor = deck.primaryColor
        val secondaryColors = deck.colors.filter { it != primaryColor }

        require(secondaryColors.size == 1) {
            "Only dual color decks supported for recommendation at this time. Found: ${deck.colors}"
        }
        val secondaryColor = secondaryColors.first()

        val setCode = setRepo.findById(deck.set).get().code

        val cards = scryfall.getCardsBySetCode(setCode)

        val inputWriter = BufferedWriter(OutputStreamWriter(process.outputStream))
        val inputPayload = objectMapper.writeValueAsString(
            mapOf(
                "cards" to cards,
                "primary_color" to primaryColor,
                "secondary_color" to secondaryColor
            )
        )

        inputWriter.write(inputPayload)
        inputWriter.flush()
        inputWriter.close()

        return try {
            val output = process.inputStream.bufferedReader().readText()
            process.waitFor(10, TimeUnit.SECONDS)
            output
        } catch (e: CancellationException) {
            process.destroyForcibly()
            throw e
        }
    }
}