package com.example.arena_set_cracker.api.model

import org.springframework.security.core.GrantedAuthority
import org.springframework.security.core.userdetails.UserDetails

class User(
    val id: Int? = null,
    private val username: String,
    private val password: String

) : UserDetails {
    override fun getAuthorities(): Set<GrantedAuthority> = emptySet()

    override fun getPassword(): String {
        return password
    }

    override fun getUsername(): String {
        return username
    }
}