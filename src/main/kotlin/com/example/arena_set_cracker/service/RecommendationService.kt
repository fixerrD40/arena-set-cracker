package com.example.arena_set_cracker.service

import com.fasterxml.jackson.databind.ObjectMapper
import kotlinx.coroutines.*
import org.springframework.stereotype.Service
import java.util.concurrent.TimeUnit
import kotlin.coroutines.cancellation.CancellationException

@Service
class RecommendationService(
    private val deckService: DeckService,
    private val setService: SetService,
    private val scryfall: CachedScryfallService,
    private val objectMapper: ObjectMapper
) {

    suspend fun scoreCardsWithPython(deckId: Int): String = coroutineScope {
        val deck = deckService.getDeckWithColors(deckId)
        val primary = deck.primaryColor
        val secondary = deck.colors.firstOrNull { it != primary }
            ?: throw IllegalArgumentException("Expected dual-color deck. Found: ${deck.colors}")

        val payload = objectMapper.writeValueAsString(
            mapOf(
                "cards" to scryfall.getCardsBySetCode(setService.getSet(deck.set).code),
                "primary_color" to primary,
                "colors" to secondary
            )
        )

        val process = ProcessBuilder("python3", "python/deck_builder/core.py").start()

        // Ensure subprocess is killed if coroutine is cancelled
        val cancellationHandler = coroutineContext.job.invokeOnCompletion {
            if (it is CancellationException) {
                process.destroyForcibly()
            }
        }

        try {
            // Write payload to Python's stdin and flush it
            process.outputStream.bufferedWriter().use { writer ->
                writer.write(payload)
                writer.flush()
            }

            // Launch a coroutine to read stderr concurrently and log it
            val stderrJob = launch(Dispatchers.IO) {
                process.errorStream.bufferedReader().useLines { lines ->
                    lines.forEach { line ->
                        // You can replace with your logger here
                        println("Python stderr: $line")
                    }
                }
            }

            // Read stdout with timeout
            val output = withTimeout(30_000) {
                process.inputStream.bufferedReader().readText()
            }

            if (output.isBlank()) {
                throw IllegalStateException("Subprocess returned no output")
            }

            // Wait for process to finish fully (with a timeout)
            if (!process.waitFor(10, TimeUnit.SECONDS)) {
                process.destroyForcibly()
                throw IllegalStateException("Python process timed out")
            }

            // Make sure stderr is fully consumed before proceeding
            stderrJob.join()

            output
        } catch (e: Exception) {
            process.destroyForcibly()
            throw e
        } finally {
            cancellationHandler.dispose()
            if (process.isAlive) {
                process.destroyForcibly()
            }
        }
    }
}