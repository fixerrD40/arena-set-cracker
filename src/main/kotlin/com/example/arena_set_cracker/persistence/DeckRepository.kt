package com.example.arena_set_cracker.persistence

import com.example.arena_set_cracker.persistence.model.DeckEntity
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface DeckRepository : JpaRepository<DeckEntity, Int>