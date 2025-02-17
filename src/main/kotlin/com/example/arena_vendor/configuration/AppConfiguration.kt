package com.example.arena_vendor.configuration

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration(proxyBeanMethods = false)
class AppConfiguration {

    @Bean
    fun objectMapper() = jacksonObjectMapper()
}