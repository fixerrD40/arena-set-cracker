package com.example.arena_vendor.persistence

import com.example.arena_vendor.persistence.model.DeckEntity
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface DeckRepository : JpaRepository<DeckEntity, Int>