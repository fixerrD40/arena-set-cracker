package com.example.arena_set_cracker.http

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.context.annotation.Configuration
import org.springframework.http.converter.HttpMessageConverter
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.web.servlet.config.annotation.CorsRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer


@Configuration(proxyBeanMethods = false)
class WebMvcConfiguration {

    @Configuration
    class WebConfig(private val objectMapper: ObjectMapper) : WebMvcConfigurer {
        override fun addCorsMappings(registry: CorsRegistry) {
            registry.addMapping("/**")
                .allowedOrigins("http://localhost:4200")
                .allowedMethods("GET", "POST", "OPTIONS", "DELETE")
                .allowedHeaders("*")
        }

        override fun extendMessageConverters(converters: MutableList<HttpMessageConverter<*>>) {
            converters.add(0, MappingJackson2HttpMessageConverter(objectMapper))
        }
    }
}