package com.example.arena_set_cracker.service

import com.example.arena_set_cracker.api.model.User
import com.example.arena_set_cracker.persistence.UserRepository
import com.example.arena_set_cracker.persistence.model.UserEntity
import com.example.arena_set_cracker.security.CryptoUtil
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Component
import java.time.Instant

@Component
class UserService(
    private val dao: UserRepository,
    private val passwordEncoder: PasswordEncoder,
    private val cryptoUtil: CryptoUtil
) {

    fun getHankId(): Int? {
        val hankUser = dao.findByUsername("Hank")
        return hankUser?.id
    }

    fun getUser(id: Int): User {
        return dao.findById(id).get().toDomain()
    }

    fun getUser(email: String): User? {
        val encodedEmail = cryptoUtil.hmacSha256(email)

        return dao.findByEmailHash(encodedEmail)?.toDomain()
    }

    fun registerUser(credentials: User): User {
        require(credentials.email != null)
        require(EMAIL_REGEX.matches(credentials.email)) { "Invalid email format." }
        val encodedEmail = cryptoUtil.hmacSha256(credentials.email)
        val encodedPassword = passwordEncoder.encode(credentials.password)

        val newUser = UserEntity(
            emailHash = encodedEmail,
            username = credentials.username,
            passwordHash = encodedPassword,
            createdAt = Instant.now()
        )

        return dao.save(newUser).toDomain()
    }

    fun resetUserPassword(userId: Int, newPassword: String): User? {
        val userOpt = dao.findById(userId)
        if (userOpt.isEmpty) return null

        val userEntity = userOpt.get()
        val encodedPassword = passwordEncoder.encode(newPassword)

        val updatedUser = userEntity.copy(passwordHash = encodedPassword)
        return dao.save(updatedUser).toDomain()
    }

    companion object {
        private val EMAIL_REGEX = Regex("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,6}$")
    }
}