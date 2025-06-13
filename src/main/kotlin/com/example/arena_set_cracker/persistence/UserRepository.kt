package com.example.arena_set_cracker.persistence

import com.example.arena_set_cracker.persistence.model.User
import org.springframework.data.jpa.repository.JpaRepository

interface UserRepository : JpaRepository<User, Int> {
    fun findByUsername(username: String): User?
}