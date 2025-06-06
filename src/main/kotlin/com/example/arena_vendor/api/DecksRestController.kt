package com.example.arena_vendor.api

import com.example.arena_vendor.api.model.Color
import com.example.arena_vendor.api.model.ColorIdentity
import com.example.arena_vendor.api.model.Deck
import com.example.arena_vendor.api.model.DeckUpdateRequest
import com.example.arena_vendor.service.DeckService
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.enums.ParameterIn
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.ExampleObject
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.tags.Tag
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
        summary = "decks",
        method = "GET",
        description = "Get saved decks.",
        responses = [
            ApiResponse(
                responseCode = "200",
                description = "Success.",
                content = [Content(examples= [ExampleObject(SAVED_DECKS)])]
            ),
            ApiResponse(responseCode = "500", description = "Fail.")
        ],
    )
    @GetMapping(produces = [MediaType.APPLICATION_JSON_VALUE])
    fun loadDecks(): ResponseEntity<List<Deck>> = ResponseEntity.ok(service.getDecks())

    @Operation(
        summary = "insertDeck",
        method = "POST",
        description = "Insert a deck.",
        responses = [
            ApiResponse(responseCode = "200", description = "Success."),
            ApiResponse(responseCode = "500", description = "Fail.")
        ],
        parameters = [
            Parameter(
                name = "name",
                description = "A name for your deck.",
                required = true,
                `in` = ParameterIn.PATH,
                example = "The Shire"
            )
        ],
        requestBody = SwaggerRequestBody(
            description = "The deck string copied when exporting a deck in Magic: The Gathering Arena",
            content = [Content(examples= [ExampleObject(PLAIN_DECK)])]
        )
    )
    @PostMapping(path = ["{name}"], consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun insertDeck(@PathVariable name: String, @RequestBody arenaDeck: String): ResponseEntity<Deck> {
        val parseResult = parseDeck(arenaDeck)

        val deck = Deck(
            name = name,
            arenaDeck = arenaDeck,
            identity = ColorIdentity.fromColors(parseResult.colors),
            cards = parseResult.cards
        )

        return ResponseEntity.ok(service.saveDeck(deck))
    }

    @Operation(
        summary = "updateDeck",
        method = "POST",
        description = "Update a deck.",
        responses = [
            ApiResponse(responseCode = "200", description = "Success."),
            ApiResponse(responseCode = "500", description = "Fail.")
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
            description = "Changes to a deck to be persisted in the backend.",
            content = [Content(examples= [ExampleObject(UPDATE_NAME_REQUEST)])]
        )
    )
    @PatchMapping("/{id}")
    fun updateDeck(@PathVariable id: Int, @RequestBody updateRequest: DeckUpdateRequest): ResponseEntity<Deck> {
        val existing = service.getDeck(id)

        val parseResult = updateRequest.arenaDeck
            ?.let { parseDeck(it) }

        val updatedDeck = existing.copy(
            name = updateRequest.name ?: existing.name,
            arenaDeck = updateRequest.arenaDeck ?: existing.arenaDeck,
            identity = parseResult?.let { ColorIdentity.fromColors(it.colors) } ?: existing.identity,
            cards = parseResult?.cards ?: existing.cards,
            tags = updateRequest.tags ?: existing.tags,
            notes = updateRequest.notes ?: existing.notes
        )

        return ResponseEntity.ok(service.saveDeck(updatedDeck))
    }

    @Operation(
        summary = "deleteDeck",
        method = "DELETE",
        description = "Delete a deck.",
        responses = [
            ApiResponse(responseCode = "200", description = "Success."),
            ApiResponse(responseCode = "500", description = "Fail.")
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
    fun deleteDeck(@PathVariable id: Int) {
        service.deleteDeck(id)
    }

    private fun parseDeck(arenaDeck: String): ParseResult {
        return ParseResult(mapOf(), setOf(Color.R))
    }

    companion object {
        private const val SAVED_DECKS = """[{"name":"Plain Deck","arenaDeck":"Deck\n60 Plains (LTR) 263"}]"""
        private const val PLAIN_DECK = """{"name":"Plain Deck","arenaDeck":"Deck\n60 Plains (LTR) 263"}"""
        private const val UPDATE_NAME_REQUEST = """{"name":"Plain Deck","arenaDeck":null,"tags":null,"notes":null}"""

        private data class ParseResult(
            val cards: Map<String, Int>,
            val colors: Set<Color>
        )
    }
}