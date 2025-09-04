package com.example.arena_set_cracker.security

import com.example.arena_set_cracker.api.model.User
import io.jsonwebtoken.Claims
import io.jsonwebtoken.JwtParser
import io.jsonwebtoken.Jwts
import io.jsonwebtoken.SignatureAlgorithm
import org.springframework.security.core.userdetails.UserDetails
import org.springframework.stereotype.Component
import java.util.*
import java.util.function.Function

@Component
class JwtUtil(
    crypto: CryptoUtil
) {
    private val key = crypto.getSigningKey()
    private val parser: JwtParser = Jwts.parserBuilder().setSigningKey(key).build()

    fun generateToken(user: User): String {
        val now = Date()
        val expiry = Date(now.time + 1000 * 60 * 60 * 10) // 10 hours

        return Jwts.builder()
            .setSubject(user.id.toString())
            .claim("username", user.username)
            .setIssuedAt(now)
            .setExpiration(expiry)
            .signWith(key, SignatureAlgorithm.HS256)
            .compact()
    }

    fun extractId(token: String): Int? =
        extractClaim(token, Claims::getSubject).toIntOrNull()

    private fun extractUsername(token: String): String =
        extractClaim(token) { claims -> claims["username"] as String }

    fun isTokenValid(token: String, userDetails: UserDetails): Boolean {
        val username = extractUsername(token)
        return username == userDetails.username && !isTokenExpired(token)
    }

    private fun isTokenExpired(token: String): Boolean =
        extractExpiration(token).before(Date())

    private fun extractExpiration(token: String): Date =
        extractClaim(token, Claims::getExpiration)

    private fun <T> extractClaim(token: String, claimsResolver: Function<Claims, T>): T {
        val claims = parser.parseClaimsJws(token).body
        return claimsResolver.apply(claims)
    }
}