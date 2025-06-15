package com.example.arena_set_cracker.api

import com.example.arena_set_cracker.api.model.MtgSet
import com.example.arena_set_cracker.service.SetService
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
@Tag(name = "Sets Rest Controller", description = "Manage Sets.")
@RequestMapping(path = [ "api/sets" ])
@SecurityRequirement(name = "bearerAuth")
class SetRestController(
    private val service: SetService
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
            ApiResponse(responseCode = "500", description = "Unexpected server error.")
        ],
    )
    @GetMapping(produces = [MediaType.APPLICATION_JSON_VALUE])
    fun loadSets(): ResponseEntity<List<MtgSet>> = ResponseEntity.ok(service.getSets())

    @Operation(
        summary = "addSet",
        method = "POST",
        description = "Add a set.",
        responses = [
            ApiResponse(responseCode = "201", description = "Set added successfully.",),
            ApiResponse(responseCode = "409", description = "Set already exists."),
            ApiResponse(responseCode = "500", description = "Unexpected server error.")
        ],
        requestBody = SwaggerRequestBody(
            required = true,
            description = "A Magic: The Gathering set to be added to user profile.",
            content = [
                Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = Schema(implementation = MtgSet::class, requiredProperties = ["code"]),
                    examples = [ExampleObject(LTR_SET)]
                )
            ]
        ),
    )
    @PostMapping
    fun addSet(@RequestBody set: MtgSet): ResponseEntity<MtgSet> {
        return try {
            // TODO validate set
            ResponseEntity.status(HttpStatus.CREATED).body(service.saveSet(set))
        } catch (e: DataIntegrityViolationException) {
            ResponseEntity.status(HttpStatus.CONFLICT).build()
        }
    }

    @Operation(
        summary = "removeSet",
        method = "DELETE",
        description = "Remove a set.",
        responses = [
            ApiResponse(responseCode = "204", description = "Set removed successfully."),
            ApiResponse(responseCode = "500", description = "Unexpected server error.")
        ],
        parameters = [
            Parameter(
                name = "id",
                description = "The unique identifier of the set to be deleted.",
                required = true,
                `in` = ParameterIn.PATH,
                example = "42"
            )
        ]
    )
    @DeleteMapping("{id}")
    fun removeSet(@PathVariable id: Int): ResponseEntity<Any> {
        service.deleteSet(id)
        return ResponseEntity.noContent().build()
    }

    companion object {
        private const val SAVED_SETS = """[{"id":1,"code":"LTR"},{"id":2,"code":"FIN"}]"""
        private const val LTR_SET = """{"id":1,"code":"LTR"}"""
    }
}