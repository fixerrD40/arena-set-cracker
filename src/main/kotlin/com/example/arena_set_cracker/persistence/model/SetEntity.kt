package com.example.arena_set_cracker.persistence.model

import com.example.arena_set_cracker.api.model.MtgSet
import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "sets")
data class SetEntity(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Int? = null,
    val appUser: Int,
    val code: String,
    val createdAt: Instant
) {
    fun toDomain(): MtgSet = MtgSet(id, code)
}