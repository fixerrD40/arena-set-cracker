package com.example.arena_set_cracker.persistence.model

import jakarta.persistence.*
import org.hibernate.annotations.CreationTimestamp
import java.time.Instant

@Entity
@Table(name = "password_resets")
data class PasswordResetEntity(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Int? = null,
    val appUser: Int,
    val tokenHash: String,
    val expiresAt: Instant,
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    val createdAt: Instant = Instant.now(),
    var used: Boolean = false
)