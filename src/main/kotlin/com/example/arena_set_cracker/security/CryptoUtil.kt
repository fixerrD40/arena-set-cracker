package com.example.arena_set_cracker.security

import io.jsonwebtoken.security.Keys
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.util.*
import javax.crypto.Mac
import javax.crypto.SecretKey

@Component
class CryptoUtil(
    @Value("\${app.crypto-secret}") private val secretKeyBase64: String
) {
    private val key: SecretKey = Keys.hmacShaKeyFor(Base64.getDecoder().decode(secretKeyBase64))
    private val mac: Mac = Mac.getInstance("HmacSHA256").apply {
        init(key)
    }

    fun hmacSha256(input: String): String {
        val digest = mac.doFinal(input.trim().lowercase().toByteArray())
        return Base64.getEncoder().encodeToString(digest)
    }

    fun getSigningKey(): SecretKey = key
}