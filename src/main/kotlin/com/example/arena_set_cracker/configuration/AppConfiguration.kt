package com.example.arena_set_cracker.configuration

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder

@Configuration(proxyBeanMethods = false)
class AppConfiguration {

    @Bean
    fun objectMapper() = jacksonObjectMapper()

    @Bean
    fun passwordEncoder(): PasswordEncoder = BCryptPasswordEncoder()
}