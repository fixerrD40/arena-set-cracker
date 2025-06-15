package com.example.arena_set_cracker.security

import com.example.arena_set_cracker.persistence.UserRepository
import org.springframework.security.core.userdetails.UserDetails
import org.springframework.security.core.userdetails.UserDetailsService
import org.springframework.security.core.userdetails.UsernameNotFoundException
import org.springframework.stereotype.Service

@Service
class SimpleUserDetailsService(private val userRepository: UserRepository) : UserDetailsService {
    override fun loadUserByUsername(username: String): UserDetails {
        val entity = userRepository.findByUsername(username)
            ?: throw UsernameNotFoundException("User not found")

        return entity.toDomain()
    }
}