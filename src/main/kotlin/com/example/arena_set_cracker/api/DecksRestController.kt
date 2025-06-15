package com.example.arena_set_cracker.api

import com.example.arena_set_cracker.api.model.Deck
import com.example.arena_set_cracker.logging.Mdcs
import com.example.arena_set_cracker.service.DeckService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.enums.ParameterIn
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.ExampleObject
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import io.swagger.v3.oas.annotations.parameters.RequestBody as SwaggerRequestBody

@RestController
@Tag(name = "Decks Rest Controller", description = "Manage Decks.")
@RequestMapping(path = [ "api/decks" ])
@SecurityRequirement(name = "bearerAuth")
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
        parameters = [
            Parameter(
                name = "X-Set",
                description = "The code representing the set to load decks for.",
                required = true,
                `in` = ParameterIn.HEADER,
                example = "FIN"
            )
        ]
    )
    @GetMapping(produces = [MediaType.APPLICATION_JSON_VALUE])
    fun loadDecks(): ResponseEntity<List<Deck>> {
        if (Mdcs.RequestContext.set == null) return ResponseEntity(HttpStatus.BAD_REQUEST)

        return ResponseEntity.ok(service.getDecks())
    }

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
                        examples = [ExampleObject(A_PLAIN_DECK)]
                    )
                ]
            ),
            ApiResponse(responseCode = "400", description = "Deck insert malformed."),
            ApiResponse(responseCode = "409", description = "Deck already exists."),
            ApiResponse(responseCode = "500", description = "Unexpected server error.")
        ],
        requestBody = SwaggerRequestBody(
            required = true,
            description = "A deck object to be persisted to the backend.",
            content = [
                Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = Schema(implementation = Deck::class, requiredProperties = ["name", "arenaDeck"]),
                    examples = [ExampleObject(THE_PLAIN_DECK)]
                )
            ]
        ),
        parameters = [
            Parameter(
                name = "X-Set",
                description = "The code representing the set to be added.",
                required = true,
                `in` = ParameterIn.HEADER,
                example = "FIN"
            )
        ]
    )
    @PostMapping(consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun insertDeck(@RequestBody deck: Deck): ResponseEntity<Deck> {
        return try {
            if (Mdcs.RequestContext.set == null) return ResponseEntity(HttpStatus.BAD_REQUEST)

            ResponseEntity.status(HttpStatus.CREATED).body(service.saveDeck(deck))
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
                        examples= [ExampleObject(THE_PLAIN_DECK)]
                    )
                ]
            ),
            ApiResponse(responseCode = "400", description = "Deck update malformed."),
            ApiResponse(responseCode = "404", description = "Deck not found."),
            ApiResponse(responseCode = "500", description = "Unexpected server error.")
        ],
        requestBody = SwaggerRequestBody(
            description = "The deck object to be persisted to the backend. Its id is required.",
            content = [
                Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = Schema(implementation = Deck::class, requiredProperties = ["id", "name", "arenaDeck"]),
                    examples= [ExampleObject(THE_PLAIN_DECK)]
                )
            ]
        )
    )
    @PatchMapping
    fun updateDeck(@RequestBody deck: Deck): ResponseEntity<Deck> {
        return try {
            if (deck.id == null) return ResponseEntity(HttpStatus.BAD_REQUEST)

            ResponseEntity.ok(service.saveDeck(deck))
        } catch (e: NoSuchElementException) {
            ResponseEntity(HttpStatus.NOT_FOUND)
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
    @DeleteMapping("{id}")
    fun deleteDeck(@PathVariable id: Int): ResponseEntity<Any> {
        return try {
            service.deleteDeck(id)
            ResponseEntity.noContent().build()
        } catch (e: NoSuchElementException) {
            return ResponseEntity(HttpStatus.NOT_FOUND)
        }
    }

    companion object {
        private const val SAVED_DECKS = """[{"id":1,"name":"Plain Deck","arenaDeck":"Deck\n60 Plains (LTR) 263"}]"""
        private const val A_PLAIN_DECK = """{"name":"Plain Deck","arenaDeck":"Deck\n60 Plains (LTR) 263"}"""
        private const val THE_PLAIN_DECK = """{"id":1,"name":"Plain Deck","arenaDeck":"Deck\n60 Plains (LTR) 263"}"""
    }
}