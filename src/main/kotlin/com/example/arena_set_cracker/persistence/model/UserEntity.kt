package com.example.arena_set_cracker.persistence.model

import com.example.arena_set_cracker.api.model.User
import jakarta.persistence.*
import java.time.Instant


@Entity
@Table(name = "users")
data class UserEntity(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Int? = null,
    val emailHash: String,
    val username: String,
    val passwordHash: String,
    val createdAt: Instant
) {
    fun toDomain(): User = User(id, emailHash, username, passwordHash)
}