package com.example.arena_set_cracker.api

import com.example.arena_set_cracker.logging.Mdcs
import com.example.arena_set_cracker.service.SetService
import com.example.arena_set_cracker.service.UserService
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

@RestController
@Tag(name = "Sets Rest Controller", description = "Manage Sets")
@RequestMapping(path = [ "api/sets" ])
class SetRestController(
    private val service: SetService,
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
            ApiResponse(responseCode = "500", description = "Unexpected server error.")
        ],
    )
    @GetMapping(produces = [MediaType.APPLICATION_JSON_VALUE])
    fun loadSets(): ResponseEntity<List<String>> {
        val user = userService.getUser()!!

        return ResponseEntity.ok(service.getSets(user))
    }

    @Operation(
        summary = "addSet",
        method = "POST",
        description = "Add a set.",
        responses = [
            ApiResponse(responseCode = "201", description = "Set added successfully.",),
            ApiResponse(responseCode = "409", description = "Set already exists."),
            ApiResponse(responseCode = "500", description = "Unexpected server error.")
        ],
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
    @PostMapping
    fun addSet(): ResponseEntity<Any> {
        return try {
            val user = userService.getUser()!!
            service.saveSet(user, Mdcs.RequestContext.set)
            ResponseEntity.status(HttpStatus.CREATED).build()
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
            ApiResponse(responseCode = "404", description = "Set not found."),
            ApiResponse(responseCode = "500", description = "Unexpected server error.")
        ],
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
    @DeleteMapping("/{id}")
    fun removeSet(): ResponseEntity<Any> {
        return try {
            val user = userService.getUser()!!
            service.deleteSet(user, Mdcs.RequestContext.set)
            ResponseEntity.noContent().build()
        } catch (e: NullPointerException) {
            return ResponseEntity(HttpStatus.NOT_FOUND)
        }
    }

    companion object {
        private const val SAVED_SETS = """["LTR","FIN"]"""
    }
}