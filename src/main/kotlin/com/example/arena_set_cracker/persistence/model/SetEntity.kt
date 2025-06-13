package com.example.arena_set_cracker.persistence.model

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "sets")
data class SetEntity(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Int = 0,
    val user: Int,
    val code: String,
    val createdAt: Instant
)