package com.example.arena_set_cracker.api

import com.example.arena_set_cracker.api.model.Deck
import com.example.arena_set_cracker.api.model.MtgSet
import com.example.arena_set_cracker.service.DeckService
import com.example.arena_set_cracker.service.RecommendationService
import com.example.arena_set_cracker.service.SetService
import com.example.arena_set_cracker.service.UserService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.enums.ParameterIn
import io.swagger.v3.oas.annotations.media.ArraySchema
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.ExampleObject
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.tags.Tag
import kotlinx.coroutines.runBlocking
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@Tag(name = "Public Rest Controller", description = "Try Hank's data.")
@RequestMapping(path = [ "public" ])
class PublicRestController(
    private val deckService: DeckService,
    private val recommendationService: RecommendationService,
    private val setService: SetService,
    private val userService: UserService
) {
    @Operation(
        summary = "loadSets",
        method = "GET",
        description = "Load sets.",
        responses = [
            ApiResponse(
                responseCode = "200",
                description = "Loaded sets successfully.",
                content = [
                    Content(
                        mediaType = MediaType.APPLICATION_JSON_VALUE,
                        schema = Schema(implementation = String::class, type = "array"),
                        examples= [ExampleObject(SAVED_SETS)]
                    )
                ]
            ),
            ApiResponse(responseCode = "404", description = "Hank did not prepare public data.",),
            ApiResponse(responseCode = "500", description = "Unexpected server error.")
        ],
    )
    @GetMapping(path = ["/sets"], produces = [MediaType.APPLICATION_JSON_VALUE])
    fun loadPublicSets(): ResponseEntity<List<MtgSet>> {
        return userService.getHankId()?.let {
            ResponseEntity.ok(setService.getSets(it))
        } ?: ResponseEntity.notFound().build()
    }

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
            ApiResponse(responseCode = "404", description = "Not found.",),
            ApiResponse(responseCode = "500", description = "Unexpected server error.")
        ],
        parameters = [
            Parameter(
                name = "set",
                description = "The set identifier.",
                required = true,
                `in` = ParameterIn.PATH,
                example = "1"
            )
        ]
    )
    @GetMapping(path = ["decks/{set}"], produces = [MediaType.APPLICATION_JSON_VALUE])
    fun loadPublicDecks(@PathVariable("set") set: Int): ResponseEntity<List<Deck>> {
        userService.getHankId()?.let { hank ->
            if (setService.getSets(hank).any { it.id == set}) {
                return ResponseEntity.ok(deckService.getDecks(set))
            }
        }
        return ResponseEntity.notFound().build()
    }

    @Operation(
        summary = "Recommend cards for a deck.",
        responses = [
            ApiResponse(
                responseCode = "200",
                description = "Recommendation successful.",
                content = [
                    Content(
                        mediaType = MediaType.APPLICATION_JSON_VALUE,
                        array = ArraySchema(
                            schema = Schema(implementation = String::class)
                        )
                    )
                ]
            ),
            ApiResponse(responseCode = "404", description = "Deck not found."),
            ApiResponse(responseCode = "500", description = "Unexpected server error.")
        ],
        parameters = [
            Parameter(
                name = "id",
                description = "The unique identifier of the deck.",
                required = true,
                `in` = ParameterIn.PATH,
                example = "42"
            )
        ]
    )
    @PostMapping(path = ["/recommend/deck/{id}"], produces = [MediaType.APPLICATION_JSON_VALUE])
    fun recommendPublicDeck(@PathVariable("id") id: Int): ResponseEntity<List<String>> {
        userService.getHankId()?.let { hank ->
            val deckSet = deckService.getDeckSet(id)
            if (setService.getSets(hank).any { it.id == deckSet }) {
                // this is a dos attack vector. Cache these.
                val recommendation = runBlocking {
                    recommendationService.scoreCardsWithPython(id)
                }

                return ResponseEntity.ok(recommendation)
            }
        }
        return ResponseEntity.notFound().build()
    }

    companion object {
        private const val SAVED_SETS = """[{"id":1,"code":"LTR"},{"id":2,"code":"FIN"}]"""
        private const val SAVED_DECKS = """[{"id":1,"name":"Plain Deck","raw":"Deck\n60 Plains (LTR) 263"}]"""
    }
}