package com.example.arena_set_cracker.api

import com.example.arena_set_cracker.api.model.PasswordReset
import com.example.arena_set_cracker.api.model.User
import com.example.arena_set_cracker.security.JwtUtil
import com.example.arena_set_cracker.service.PasswordResetService
import com.example.arena_set_cracker.service.UserService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.ExampleObject
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.authentication.AuthenticationManager
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import io.swagger.v3.oas.annotations.parameters.RequestBody as SwaggerRequestBody

@RestController
@Tag(name = "Authentication Rest Controller", description = "Manage user authentication.")
@RequestMapping("auth")
class AuthenticationRestController(
    private val authenticationManager: AuthenticationManager,
    private val passwordResetService: PasswordResetService,
    private val userService: UserService,
    private val jwtUtil: JwtUtil
) {

    @Operation(
        summary = "Login user",
        method = "POST",
        description = "Authenticate an existing user.",
        responses = [
            ApiResponse(responseCode = "200", description = "Authentication successful.",
                content = [Content(schema = Schema(implementation = String::class, description = "Jwt as a string."))]
            ),
            ApiResponse(responseCode = "400", description = "Authentication malformed."),
            ApiResponse(responseCode = "401", description = "Invalid username or password."),
            ApiResponse(responseCode = "500", description = "Unexpected server error.")
        ],
        requestBody = SwaggerRequestBody(
            required = true,
            description = "A deck object to be persisted to the backend.",
            content = [
                Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = Schema(implementation = User::class, requiredProperties = ["username", "password"]),
                    examples = [ExampleObject(MY_USER)]
                )
            ]
        )
    )
    @PostMapping("login")
    fun loginUser(@RequestBody credentials: User): ResponseEntity<String> {
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

    @Operation(
        summary = "Register user",
        method = "POST",
        description = "Register and authenticate new user.",
        responses = [
            ApiResponse(responseCode = "201", description = "User registered successfully.",
                content = [Content(schema = Schema(implementation = String::class, description = "Jwt as a string."))]
            ),
            ApiResponse(responseCode = "400", description = "Registration malformed."),
            ApiResponse(responseCode = "409", description = "You already have an account."),
            ApiResponse(responseCode = "500", description = "Unexpected server error.")
        ],
        requestBody = SwaggerRequestBody(
            required = true,
            description = "A deck object to be persisted to the backend.",
            content = [
                Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = Schema(implementation = User::class, requiredProperties = ["email", "username", "password"]),
                    examples = [ExampleObject(MY_USER)]
                )
            ]
        )
    )
    @PostMapping("register")
    fun registerUser(@RequestBody credentials: User): ResponseEntity<String> {
        return try {
            val user = userService.registerUser(credentials)

            val jwt = jwtUtil.generateToken(user)

            ResponseEntity.status(HttpStatus.CREATED).body(jwt)
        } catch (e: DataIntegrityViolationException) {
            ResponseEntity.status(HttpStatus.CONFLICT).build()
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
    }

    @Operation(
        summary = "Request reset password",
        method = "POST",
        description = "Request reset password for a user to their email.",
        responses = [
            ApiResponse(responseCode = "202", description = "Request accepted."),
            ApiResponse(responseCode = "400", description = "Request malformed."),
            ApiResponse(responseCode = "500", description = "Unexpected server error.")
        ],
        requestBody = SwaggerRequestBody(
            required = true,
            description = "The email used to create the user.",
            content = [
                Content(
                    mediaType = MediaType.TEXT_PLAIN_VALUE,
                    schema = Schema(implementation = String::class, example = MY_EMAIL)
                )
            ]
        )
    )
    @PostMapping("request-reset")
    fun requestPasswordReset(@RequestBody email: String): ResponseEntity<Any> {
        passwordResetService.requestPasswordReset(email)
        return ResponseEntity.accepted().build()
    }

    @Operation(
        summary = "Reset password",
        method = "POST",
        description = "Reset password using a valid token.",
        responses = [
            ApiResponse(responseCode = "200", description = "Password was reset."),
            ApiResponse(responseCode = "400", description = "Invalid or expired token."),
            ApiResponse(responseCode = "500", description = "Unexpected server error.")
        ],
        requestBody = SwaggerRequestBody(
            required = true,
            description = "A deck object to be persisted to the backend.",
            content = [
                Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = Schema(implementation = PasswordReset::class, requiredProperties = ["token", "newPassword"]),
                    examples = [ExampleObject(MY_PASSWORD_RESET)]
                )
            ]
        )
    )
    @PostMapping("reset-password")
    fun resetPassword(@RequestBody request: PasswordReset): ResponseEntity<Any> =
        try {
            passwordResetService.resetPassword(request.token, request.newPassword)
            ResponseEntity.ok().build()
        } catch (e: IllegalStateException) {
            ResponseEntity.badRequest().build()
        }

    companion object {
        private const val MY_EMAIL = "myEmail@myProvider.ext"
        private const val MY_USER  = """{"email":"$MY_EMAIL","username":"myUser","password":"myPassword"}"""
        private const val MY_PASSWORD_RESET = """{"token":"myToken","newPassword":"myNewPassword"}"""
    }
}