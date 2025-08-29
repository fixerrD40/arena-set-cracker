package com.example.arena_set_cracker.security

import com.example.arena_set_cracker.service.UserService
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.security.authentication.AuthenticationManager
import org.springframework.security.authentication.ProviderManager
import org.springframework.security.authentication.dao.DaoAuthenticationProvider
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter
import org.springframework.security.web.util.matcher.RequestMatcher

@Configuration
@EnableWebSecurity
class SecurityConfig {

    @Bean
    fun authenticationManager(userDetailsService: SimpleUserDetailsService,  passwordEncoder: PasswordEncoder): AuthenticationManager {
        val provider = DaoAuthenticationProvider(userDetailsService)
        provider.setPasswordEncoder(passwordEncoder)
        return ProviderManager(listOf(provider))
    }

    @Bean
    fun protectedPathsMatcher(): RequestMatcher = RequestMatcher { request ->
        request.requestURI.startsWith("/api/")
    }

    @Bean
    fun jwtRequestFilter(userService: UserService, jwtUtil: JwtUtil, protectedPathsMatcher: RequestMatcher): JwtRequestFilter {
        return JwtRequestFilter(userService, jwtUtil, protectedPathsMatcher)
    }

    @Bean
    fun securityFilterChain(http: HttpSecurity, jwtRequestFilter: JwtRequestFilter): SecurityFilterChain {
        http
            .cors { }
            .csrf { it.disable() }
            .authorizeHttpRequests {
                it
                    .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                    .requestMatchers("/authenticate", "/register", "/error", "/public/**").permitAll()
                    .requestMatchers("/api/**").authenticated()
            }
            .sessionManagement {
                it.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            }
            .addFilterBefore(jwtRequestFilter, UsernamePasswordAuthenticationFilter::class.java)

        return http.build()
    }
}