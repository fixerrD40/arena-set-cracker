package com.example.arena_set_cracker.security

import com.example.arena_set_cracker.service.UserService
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource
import org.springframework.security.web.util.matcher.RequestMatcher
import org.springframework.web.filter.OncePerRequestFilter

class JwtRequestFilter(
    private val userService: UserService,
    private val jwtUtil: JwtUtil,
    private val protectedPaths: RequestMatcher
) : OncePerRequestFilter() {

    override fun shouldNotFilter(request: HttpServletRequest): Boolean {
        return !protectedPaths.matches(request)
    }

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain) {
        val authHeader = request.getHeader("Authorization")
        var userId: Int? = null
        var jwt: String? = null

        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            jwt = authHeader.substring(7)
            try {
                userId = jwtUtil.extractId(jwt)
            } catch (e: Exception) {
                // log or handle expired or malformed token
            }
        }

        if (userId != null && SecurityContextHolder.getContext().authentication == null) {
            val user = userService.getUser(userId)
            if (jwtUtil.isTokenValid(jwt!!, user)) {
                val authToken = UsernamePasswordAuthenticationToken(user, null, user.authorities)
                authToken.details = WebAuthenticationDetailsSource().buildDetails(request)
                SecurityContextHolder.getContext().authentication = authToken
            }
        }

        filterChain.doFilter(request, response)
    }
}