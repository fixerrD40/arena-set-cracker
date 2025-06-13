package com.example.arena_set_cracker.service

import com.example.arena_set_cracker.persistence.SetRepository
import com.example.arena_set_cracker.persistence.model.SetEntity
import org.springframework.stereotype.Component
import java.time.Instant

@Component
class SetService(
    private val dao: SetRepository
) {

    fun getSet(user: Int, setCode: String): Int? = dao.getByUserAndCode(user, setCode)?.id

    fun getSets(user: Int): List<String> = dao.findAll()
        .filter { it.user == user }
        .map { it.code }

    fun saveSet(user: Int, setCode: String) {
        val existingSet = dao.getByUserAndCode(user, setCode)

        val entity = SetEntity(
            code = setCode,
            user = user,
            createdAt = existingSet?.createdAt ?: Instant.now()
        )

        dao.save(entity)
    }

    fun deleteSet(user: Int, setCode: String) {
        val existingSet = dao.getByUserAndCode(user, setCode)!!

        dao.deleteById(existingSet.id)
    }
}