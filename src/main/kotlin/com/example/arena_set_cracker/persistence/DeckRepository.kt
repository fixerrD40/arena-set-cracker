package com.example.arena_set_cracker.persistence

import com.example.arena_set_cracker.persistence.model.DeckEntity
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

@Repository
interface DeckRepository : JpaRepository<DeckEntity, Int> {
    fun findAllBySet(set: Int): List<DeckEntity>

    @Query("SELECT d FROM DeckEntity d LEFT JOIN FETCH d.colors WHERE d.id = :id")
    fun findByIdWithColors(@Param("id") id: Int): DeckEntity?
}