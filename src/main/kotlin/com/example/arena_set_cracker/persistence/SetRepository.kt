package com.example.arena_set_cracker.persistence

import com.example.arena_set_cracker.persistence.model.SetEntity
import org.springframework.data.jpa.repository.JpaRepository

interface SetRepository : JpaRepository<SetEntity, Int> {
    fun getByUserAndCode(user: Int, code: String): SetEntity?
}