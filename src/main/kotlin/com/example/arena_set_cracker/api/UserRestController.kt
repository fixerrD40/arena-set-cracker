package com.example.arena_set_cracker.api

import com.example.arena_set_cracker.api.model.Credentials
import com.example.arena_set_cracker.service.UserService
import io.swagger.v3.oas.annotations.tags.Tag
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
    private val userService: UserService
) {

    @PostMapping
    fun registerUser(@RequestBody credentials: Credentials): ResponseEntity<User> {
        return try {
            val user = userService.registerUser(credentials.username, credentials.password)

            ResponseEntity.status(HttpStatus.CREATED).body(user)
        } catch (e: IllegalArgumentException) {
            ResponseEntity.status(HttpStatus.CONFLICT).build()
        }
    }
}