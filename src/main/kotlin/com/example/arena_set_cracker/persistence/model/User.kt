package com.example.arena_set_cracker.persistence.model

import jakarta.persistence.*
import java.time.Instant


@Entity
@Table(name = "users")
data class User(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Int = 0,
    val username: String,
    val password: String,
    val createdAt: Instant? = null
)