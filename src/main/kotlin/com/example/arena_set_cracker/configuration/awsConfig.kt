package com.example.arena_set_cracker.configuration

import com.example.arena_set_cracker.configuration.properties.AwsProperties
import com.example.arena_set_cracker.service.AwsSesMailService
import com.example.arena_set_cracker.service.MailService
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.ses.SesClient

@Configuration
class AwsConfig(
    properties: AwsProperties
) {
    private val region = Region.of(properties.region)
    private val sesEmail = properties.ses.email

    @Bean
    fun sesClient(): SesClient {
        return SesClient.builder()
            .region(region)
            .build()
    }

    @Bean
    @ConditionalOnProperty(name = ["app.mail"], havingValue = "AWSSES")
    fun awsSesMailService(sesClient: SesClient): MailService {
        return AwsSesMailService(sesClient, sesEmail)
    }
}