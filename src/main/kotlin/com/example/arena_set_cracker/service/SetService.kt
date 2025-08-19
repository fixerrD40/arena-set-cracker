package com.example.arena_set_cracker.service

import com.example.arena_set_cracker.api.model.MtgSet
import com.example.arena_set_cracker.api.model.User
import com.example.arena_set_cracker.persistence.SetRepository
import com.example.arena_set_cracker.persistence.model.SetEntity
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import java.time.Instant

@Component
class SetService(
    private val dao: SetRepository
) {

    fun getSet(id: Int): MtgSet = dao.findById(id).get().toDomain()

    fun getSets(): List<MtgSet> {
        val user = SecurityContextHolder.getContext().authentication.principal as User

        return dao.findAll()
            .filter { it.appUser == user.id }
            .map { it.toDomain() }
    }

    fun saveSet(set: MtgSet): MtgSet {
        val user = SecurityContextHolder.getContext().authentication.principal as User

        val entity = SetEntity(
            appUser = user.id!!,
            code = set.code,
            createdAt = Instant.now()
        )

        return dao.save(entity).toDomain()
    }

    fun deleteSet(set: Int) = dao.deleteById(set)
}