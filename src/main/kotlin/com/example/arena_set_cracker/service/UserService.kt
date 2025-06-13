package com.example.arena_set_cracker.service

import com.example.arena_set_cracker.persistence.UserRepository
import com.example.arena_set_cracker.persistence.model.User
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Component
import java.time.Instant

@Component
class UserService(
    private val dao: UserRepository,
    private val passwordEncoder: PasswordEncoder
) {

    fun registerUser(username: String, rawPassword: String) {
        val encodedPassword = passwordEncoder.encode(rawPassword)

        val newUser = User(
            username = username,
            password = encodedPassword,
            createdAt = Instant.now()
        )

        dao.save(newUser)
    }
}