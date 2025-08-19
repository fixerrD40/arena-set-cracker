package com.example.arena_set_cracker.service

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Service
import java.io.BufferedWriter
import java.io.OutputStreamWriter
import java.util.concurrent.TimeUnit
import kotlin.coroutines.cancellation.CancellationException

@Service
class RecommendationService(
    private val deckService: DeckService,
    private val setService: SetService,
    private val scryfall: CachedScryfallService,
    private val objectMapper: ObjectMapper
) {

    fun scoreCardsWithPython(deckId: Int): List<String> {
        val processBuilder = ProcessBuilder("python3", "python/deck_builder/core.py")
        val process = processBuilder.start()

        val deck = deckService.getDeckWithColors(deckId)
        val primaryColor = deck.primaryColor
        val secondaryColors = deck.colors.filter { it != primaryColor }

        require(secondaryColors.size == 1) {
            "Only dual color decks supported for recommendation at this time. Found: ${deck.colors}"
        }
        val secondaryColor = secondaryColors.first()

        val setCode = setService.getSet(deck.set).code

        val cards = scryfall.getCardsBySetCode(setCode)

        val inputWriter = BufferedWriter(OutputStreamWriter(process.outputStream))
        val inputPayload = objectMapper.writeValueAsString(
            mapOf(
                "cards" to cards,
                "primary_color" to primaryColor,
                "secondary_color" to secondaryColor
            )
        )

        val errorReader = Thread {
            val stderr = process.errorStream.bufferedReader().readText()
            if (stderr.isNotBlank()) {
                println("Python stderr: $stderr")
            }
        }
        errorReader.start()

        inputWriter.write(inputPayload)
        inputWriter.flush()
        inputWriter.close()

        return try {
            val output = process.inputStream.bufferedReader().readText()
            process.waitFor(10, TimeUnit.SECONDS)
            objectMapper.readValue(output, object : TypeReference<List<String>>() {})
        } catch (e: CancellationException) {
            process.destroyForcibly()
            throw e
        }
    }
}