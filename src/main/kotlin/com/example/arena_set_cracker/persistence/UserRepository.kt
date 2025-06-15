package com.example.arena_set_cracker.persistence

import com.example.arena_set_cracker.persistence.model.UserEntity
import org.springframework.data.jpa.repository.JpaRepository

interface UserRepository : JpaRepository<UserEntity, Int> {
    fun findByUsername(username: String): UserEntity?
}