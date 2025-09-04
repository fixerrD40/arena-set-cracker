package com.example.arena_set_cracker.api.model

data class PasswordReset(
    val token: String,
    val newPassword: String
)