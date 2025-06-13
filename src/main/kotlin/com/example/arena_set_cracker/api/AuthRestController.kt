package com.example.arena_set_cracker.api

import com.example.arena_set_cracker.api.model.AuthResult
import com.example.arena_set_cracker.api.model.Credentials
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
import org.springframework.security.core.userdetails.UserDetailsService
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "Authentication Rest Controller", description = "Authenticate user")
@RequestMapping(path = [ "authenticate" ])
class AuthRestController(
    private val authenticationManager: AuthenticationManager,
    private val jwtUtil: JwtUtil,
    private val userDetailsService: UserDetailsService
) {

    @Operation(summary = "Authenticate user and generate JWT token")
    @ApiResponses(
        ApiResponse(responseCode = "200", description = "Authentication successful",
            content = [Content(schema = Schema(implementation = AuthResult::class))]),
        ApiResponse(responseCode = "401", description = "Invalid username or password")
    )
    @PostMapping
    fun authenticateUser(@RequestBody credentials: Credentials): ResponseEntity<AuthResult> {
        try {
            val authToken = UsernamePasswordAuthenticationToken(credentials.username, credentials.password)
            authenticationManager.authenticate(authToken)

            val userDetails = userDetailsService.loadUserByUsername(credentials.username)
            val jwt = jwtUtil.generateToken(userDetails)

            return ResponseEntity.ok(AuthResult(credentials.username, jwt))
        } catch (e: BadCredentialsException) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build()
        }
    }
}