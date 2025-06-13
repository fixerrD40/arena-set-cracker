package com.example.arena_set_cracker.api

import com.example.arena_set_cracker.api.model.Color
import com.example.arena_set_cracker.api.model.ColorIdentity
import com.example.arena_set_cracker.api.model.Deck
import com.example.arena_set_cracker.service.DeckService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.enums.ParameterIn
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.ExampleObject
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import io.swagger.v3.oas.annotations.parameters.RequestBody as SwaggerRequestBody

@RestController
@Tag(name = "Decks Rest Controller", description = "Manage Decks")
@RequestMapping(path = [ "api/decks" ])
class DecksRestController(
    private val service: DeckService
) {

    @Operation(
        summary = "loadDecks",
        method = "GET",
        description = "Load saved decks.",
        responses = [
            ApiResponse(
                responseCode = "200",
                description = "Loaded saved decks successfully.",
                content = [
                    Content(
                        mediaType = MediaType.APPLICATION_JSON_VALUE,
                        schema = Schema(implementation = Deck::class, type = "array"),
                        examples= [ExampleObject(SAVED_DECKS)]
                    )
                ]
            ),
            ApiResponse(responseCode = "500", description = "Unexpected server error.")
        ],
    )
    @GetMapping(produces = [MediaType.APPLICATION_JSON_VALUE])
    fun loadDecks(): ResponseEntity<List<Deck>> = ResponseEntity.ok(service.getDecks())

    @Operation(
        summary = "insertDeck",
        method = "POST",
        description = "Insert a deck.",
        responses = [
            ApiResponse(
                responseCode = "201",
                description = "Deck created successfully.",
                content = [
                    Content(
                        mediaType = MediaType.APPLICATION_JSON_VALUE,
                        schema = Schema(implementation = Deck::class),
                        examples = [ExampleObject(PLAIN_DECK)]
                    )
                ]
            ),
            ApiResponse(responseCode = "409", description = "Deck already exists."),
            ApiResponse(responseCode = "500", description = "Unexpected server error.")
        ],
        requestBody = SwaggerRequestBody(
            required = true,
            description = "A deck object to be persisted to the backend.",
            content = [
                Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = Schema(implementation = Deck::class),
                    examples = [ExampleObject(PLAIN_DECK)]
                )
            ]
        )
    )
    @PostMapping(consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun insertDeck(@RequestBody input: Deck): ResponseEntity<Deck> {
        return try {
            val detailedDeck = populateDeckDetails(input)

            ResponseEntity.status(HttpStatus.CREATED).body(detailedDeck)
        } catch (e: DataIntegrityViolationException) {
            ResponseEntity.status(HttpStatus.CONFLICT).build()
        }
    }

    @Operation(
        summary = "updateDeck",
        method = "POST",
        description = "Update a deck.",
        responses = [
            ApiResponse(
                responseCode = "200",
                description = "Deck updated successfully.",
                content = [
                    Content(
                        mediaType = MediaType.APPLICATION_JSON_VALUE,
                        schema = Schema(implementation = Deck::class),
                        examples= [ExampleObject(PLAIN_DECK)]
                    )
                ]
            ),
            ApiResponse(responseCode = "404", description = "Deck not found."),
            ApiResponse(responseCode = "500", description = "Unexpected server error.")
        ],
        parameters = [
            Parameter(
                name = "id",
                description = "The unique identifier of the deck to be updated.",
                required = true,
                `in` = ParameterIn.PATH,
                example = "42"
            )
        ],
        requestBody = SwaggerRequestBody(
            description = "The deck object to be persisted to the backend.",
            content = [
                Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = Schema(implementation = Deck::class),
                    examples= [ExampleObject(TAGGED_PLAIN_DECK)]
                )
            ]
        )
    )
    @PatchMapping("/{id}")
    fun updateDeck(@PathVariable id: Int, @RequestBody deckUpdates: Deck): ResponseEntity<Deck> {
        try {
            val existing = service.getDeck(id)

            val detailedDeckUpdates = if (deckUpdates.arenaDeck != existing.arenaDeck) populateDeckDetails(deckUpdates)
            else null

            val updatedDeck = existing.copy(
                name = deckUpdates.name,
                arenaDeck = deckUpdates.arenaDeck,
                identity = detailedDeckUpdates?.identity ?: existing.identity,
                cards = detailedDeckUpdates?.cards ?: existing.cards,
                tags = deckUpdates.tags,
                notes = deckUpdates.notes
            )

            return ResponseEntity.ok(service.saveDeck(updatedDeck))
        } catch (e: NoSuchElementException) {
            return ResponseEntity(HttpStatus.NOT_FOUND)
        }
    }

    @Operation(
        summary = "deleteDeck",
        method = "DELETE",
        description = "Delete a deck.",
        responses = [
            ApiResponse(responseCode = "204", description = "Deck deleted successfully."),
            ApiResponse(responseCode = "404", description = "Deck not found."),
            ApiResponse(responseCode = "500", description = "Unexpected server error.")
        ],
        parameters = [
            Parameter(
                name = "id",
                description = "The unique identifier of the deck to be deleted.",
                required = true,
                `in` = ParameterIn.PATH,
                example = "42"
            )
        ]
    )
    @DeleteMapping("/{id}")
    fun deleteDeck(@PathVariable id: Int): ResponseEntity<Any> {
        return try {
            service.deleteDeck(id)
            ResponseEntity.noContent().build()
        } catch (e: NoSuchElementException) {
            return ResponseEntity(HttpStatus.NOT_FOUND)
        }
    }

    private fun populateDeckDetails(input: Deck): Deck {
        return input.copy(
            cards = mapOf(),
            identity = ColorIdentity.fromColors(setOf(Color.R))
        )
    }

    companion object {
        private const val SAVED_DECKS = """[{"name":"Plain Deck","arenaDeck":"Deck\n60 Plains (LTR) 263"}]"""
        private const val PLAIN_DECK = """{"name":"Plain Deck","arenaDeck":"Deck\n60 Plains (LTR) 263"}"""
        private const val TAGGED_PLAIN_DECK = """{"name":"Plain Deck","arenaDeck":"Deck\n60 Plains (LTR) 263","tags":["passive"]}"""
    }
}