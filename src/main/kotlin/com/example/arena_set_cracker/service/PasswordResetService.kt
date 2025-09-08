package com.example.arena_set_cracker.service

import com.example.arena_set_cracker.api.model.User
import com.example.arena_set_cracker.persistence.PasswordResetRepository
import com.example.arena_set_cracker.persistence.model.PasswordResetEntity
import com.example.arena_set_cracker.security.CryptoUtil
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.time.Duration
import java.time.Instant
import java.util.*

@Component
class PasswordResetService(
    private val dao: PasswordResetRepository,
    private val users: UserService,
    private val crypto: CryptoUtil,
    private val mailSender: MailService,
    @Value("\${app.base-url}") private val baseUrl: String
) {

    fun requestPasswordReset(email: String) {
        val user = users.getUser(email) ?: return

        if (canRequestReset(user)) return

        dao.deleteByAppUser(user.id!!)
        val rawToken = generateAndSaveToken(user)
        val resetLink = "$baseUrl/reset-password?token=$rawToken"

        mailSender.sendEmail(
            toAddress = email,
            subject = "Reset Your Password",
            body = "You requested a password reset. Click the link below to reset your password:\n\n$resetLink\n\nIf you didn't request this, you can ignore this email."
        )
    }

    fun resetPassword(token: String, newPassword: String) {
        val hash = crypto.hmacSha256(token)
        val user = dao.findValidByTokenHash(hash)!!.id!!

        users.resetUserPassword(user, newPassword)
    }

    private fun canRequestReset(user: User): Boolean {
        val recentReset = dao.findTopByAppUserOrderByCreatedAtDesc(user.id!!)
        return recentReset == null || Duration.between(recentReset.createdAt, Instant.now()) > Duration.ofHours(24)
    }

    private fun generateAndSaveToken(user: User) {
        val token = UUID.randomUUID().toString()
        val tokenHash = crypto.hmacSha256(token)

        val entity = PasswordResetEntity(
            appUser = user.id!!,
            tokenHash = tokenHash,
            expiresAt = Instant.now().plus(Duration.ofMinutes(30)),
            used = false
        )

        dao.save(entity)
    }
}