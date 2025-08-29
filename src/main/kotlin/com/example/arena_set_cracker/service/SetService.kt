package com.example.arena_set_cracker.service

import com.example.arena_set_cracker.api.model.MtgSet
import com.example.arena_set_cracker.persistence.SetRepository
import com.example.arena_set_cracker.persistence.model.SetEntity
import org.springframework.stereotype.Component
import java.time.Instant

@Component
class SetService(
    private val dao: SetRepository,
    private val userService: UserService
) {

    fun getSet(id: Int): MtgSet = dao.findById(id).get().toDomain()

    fun getSets(user: Int): List<MtgSet> {
        return dao.findAll()
            .filter { it.appUser == user }
            .map { it.toDomain() }
    }

    fun saveSet(user: Int, set: MtgSet): MtgSet {
        val entity = SetEntity(
            appUser = user,
            code = set.code,
            createdAt = Instant.now()
        )

        return dao.save(entity).toDomain()
    }

    fun deleteSet(set: Int) = dao.deleteById(set)
}