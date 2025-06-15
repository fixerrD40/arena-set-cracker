package com.example.arena_set_cracker.api

import com.example.arena_set_cracker.api.model.User
import com.example.arena_set_cracker.security.JwtUtil
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.authentication.AuthenticationManager
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "Authentication Rest Controller", description = "Authenticate user.")
@RequestMapping("authenticate")
class AuthenticationRestController(
    private val authenticationManager: AuthenticationManager,
    private val jwtUtil: JwtUtil
) {

    @Operation(summary = "Authenticate user and generate JWT token.")
    @ApiResponses(
        ApiResponse(responseCode = "200", description = "Authentication successful.",
            content = [Content(schema = Schema(implementation = String::class, description = "Jwt as a string."))]
        ),
        ApiResponse(responseCode = "400", description = "Authentication malformed."),
        ApiResponse(responseCode = "401", description = "Invalid username or password."),
        ApiResponse(responseCode = "500", description = "Unexpected server error.")
    )
    @PostMapping
    fun authenticateUser(@RequestBody credentials: User): ResponseEntity<String> {
        try {
            val authToken = UsernamePasswordAuthenticationToken(credentials.username, credentials.password)
            val authentication = authenticationManager.authenticate(authToken)

            val user = authentication.principal as User

            val jwt = jwtUtil.generateToken(user)

            return ResponseEntity.ok(jwt)
        } catch (e: BadCredentialsException) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build()
        }
    }
}