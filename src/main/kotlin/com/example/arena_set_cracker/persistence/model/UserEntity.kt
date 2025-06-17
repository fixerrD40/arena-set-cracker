package com.example.arena_set_cracker.persistence.model

import com.example.arena_set_cracker.api.model.User
import jakarta.persistence.*
import java.time.Instant


@Entity
@Table(name = "users")
data class UserEntity(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Int = 0,
    val username: String,
    val passwordHash: String,
    val createdAt: Instant? = null
) {
    fun toDomain(): User = User(id, username, passwordHash)
}