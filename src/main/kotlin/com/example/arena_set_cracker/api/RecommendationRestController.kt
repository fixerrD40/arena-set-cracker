package com.example.arena_set_cracker.api

import com.example.arena_set_cracker.service.JobManager
import com.example.arena_set_cracker.service.RecommendationService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.enums.ParameterIn
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.tags.Tag
import kotlinx.coroutines.runBlocking
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "Recommendation Rest Controller", description = "Manage card recommendations.")
@RequestMapping("recommend")
class RecommendationRestController(
    private val recommendationService: RecommendationService
) {

    @Operation(
        summary = "Recommend cards for a deck.",
        responses = [
            ApiResponse(responseCode = "200", description = "Recommendation successful.",
                content = [Content(schema = Schema(implementation = String::class, description = "Scored cards as a string."))]
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
    @PostMapping(path = ["deck/{id}"], produces = [MediaType.APPLICATION_JSON_VALUE])
    fun recommendDeck(@PathVariable("id") id: Int): ResponseEntity<String> {
        val recommendation = runBlocking {
            JobManager.submitJob {
                recommendationService.scoreCardsWithPython(id)
            }.await()
        }

        return ResponseEntity.ok(recommendation)
    }

    @PostMapping("/cancel")
    fun cancelRecommendation(): ResponseEntity<String> {
        JobManager.cancelJob()
        return ResponseEntity.ok("Job cancelled.")
    }
}