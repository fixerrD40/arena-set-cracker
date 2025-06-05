package com.example.arena_vendor.api

import com.example.arena_vendor.api.model.Deck
import com.example.arena_vendor.deck.DeckService
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.ExampleObject
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
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
        description = "Get saved decks",
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
    fun decks(): ResponseEntity<Set<Deck>> = ResponseEntity.ok(service.getDecks())

    @Operation(
        summary = "decksNames",
        method = "GET",
        description = "Get the names of saved decks",
        responses = [
            ApiResponse(
                responseCode = "200",
                description = "Success.",
                content = [Content(examples= [ExampleObject(SAVED_DECKS_NAMES)])]
            ),
            ApiResponse(responseCode = "500", description = "Fail.")
        ]
    )
    @GetMapping(path = ["names"], produces = [MediaType.APPLICATION_JSON_VALUE])
    fun deckNames(): ResponseEntity<Set<String>> = ResponseEntity.ok(service.getDeckNames())

    @Operation(
        summary = "saveDeck",
        method = "POST",
        description = "Save a deck.",
        responses = [
            ApiResponse(responseCode = "200", description = "Success."),
            ApiResponse(responseCode = "500", description = "Fail.")
        ],
        requestBody = SwaggerRequestBody(
            description = "A name and the deck string copied when exporting a deck in Magic: The Gathering Arena",
            content = [Content(examples= [ExampleObject(PLAIN_DECK)])]
        )
    )
    @PostMapping(consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun saveDeck(@RequestBody deck: Deck) {
        check(service.insertDeck(deck))
    }

    @Operation(
        summary = "loadDeck",
        method = "GET",
        description = "Load a deck.",
        responses = [
            ApiResponse(
                responseCode = "200",
                description = "Success.",
                content = [Content(examples= [ExampleObject(PLAIN_DECK)])]
            ),
            ApiResponse(responseCode = "404", description = "Not found."),
            ApiResponse(responseCode = "500", description = "Fail.")
        ]
    )
    @GetMapping(path = ["{id}"], produces = [MediaType.APPLICATION_JSON_VALUE])
    fun loadDeck(@PathVariable id: Int): ResponseEntity<Deck> {
        return service.getDeck(id)
            ?.let { ResponseEntity.ok(it) }
            ?: ResponseEntity.notFound().build()
    }

    companion object {
        private const val SAVED_DECKS = """[{"name":"Plain Deck","arenaDeck":"Deck\n60 Plains (LTR) 263"}]"""
        private const val SAVED_DECKS_NAMES = """["Plain Deck"]"""
        private const val PLAIN_DECK = """{"name":"Plain Deck","arenaDeck":"Deck\n60 Plains (LTR) 263"}"""
    }
}