package com.example.arena_set_cracker.api

import com.example.arena_set_cracker.api.model.AuthResult
import com.example.arena_set_cracker.api.model.Credentials
import com.example.arena_set_cracker.security.JwtUtil
import com.example.arena_set_cracker.security.SimpleUserDetailsService
import com.example.arena_set_cracker.service.UserService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "User Rest Controller", description = "Register new users")
@RequestMapping("api/users")
class UserRestController(
    private val userDetailsService: SimpleUserDetailsService,
    private val userService: UserService,
    private val jwtUtil: JwtUtil
) {

    @Operation(summary = "Register a new user and return JWT token")
    @ApiResponses(
        ApiResponse(responseCode = "201", description = "User registered successfully.",
            content = [Content(schema = Schema(implementation = AuthResult::class))]),
        ApiResponse(responseCode = "400", description = "Validation failed."),
        ApiResponse(responseCode = "409", description = "Username already exists."),
        ApiResponse(responseCode = "500", description = "Unexpected server error.")
    )
    @PostMapping
    fun registerUser(@RequestBody credentials: Credentials): ResponseEntity<AuthResult> {
        return try {
            val user = userService.registerUser(credentials.username, credentials.password)

            val userDetails = userDetailsService.loadUserByUsername(credentials.username)
            val jwt = jwtUtil.generateToken(userDetails)

            ResponseEntity.status(HttpStatus.CREATED).body(AuthResult(credentials.username, jwt))
        } catch (e: DataIntegrityViolationException) {
            ResponseEntity.status(HttpStatus.CONFLICT).build()
        }
    }
}