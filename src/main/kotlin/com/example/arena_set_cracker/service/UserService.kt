package com.example.arena_set_cracker.service

import com.example.arena_set_cracker.api.model.User
import com.example.arena_set_cracker.persistence.UserRepository
import com.example.arena_set_cracker.persistence.model.UserEntity
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Component
import java.time.Instant

@Component
class UserService(
    private val dao: UserRepository,
    private val passwordEncoder: PasswordEncoder
) {

    fun getHankId(): Int? {
        val hankUser = dao.findByUsername("Hank")
        return hankUser?.id
    }

    fun getUser(id: Int): User {
        return dao.findById(id).get().toDomain()
    }

    fun registerUser(credentials: User): User {
        val encodedPassword = passwordEncoder.encode(credentials.password)

        val newUser = UserEntity(
            username = credentials.username,
            passwordHash = encodedPassword,
            createdAt = Instant.now()
        )

        return dao.save(newUser).toDomain()
    }
}