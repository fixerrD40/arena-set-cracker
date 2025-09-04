package com.example.arena_set_cracker.persistence

import com.example.arena_set_cracker.persistence.model.PasswordResetEntity
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.util.*

interface PasswordResetRepository : JpaRepository<PasswordResetEntity, UUID> {

    fun findTopByAppUserOrderByCreatedAtDesc(userId: Int): PasswordResetEntity?

    @Query("SELECT p FROM PasswordResetEntity p WHERE p.tokenHash = :tokenHash AND p.used = false AND p.expiresAt > CURRENT_TIMESTAMP")
    fun findValidByTokenHash(@Param("tokenHash") tokenHash: String): PasswordResetEntity?

    fun deleteByAppUser(userId: Int): Long
}