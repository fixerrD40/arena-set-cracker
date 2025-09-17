package com.example.arena_set_cracker.service

import software.amazon.awssdk.services.ses.SesClient
import software.amazon.awssdk.services.ses.model.*

class AwsSesMailService(
    private val sesClient: SesClient,
    private val appSource: String
): MailService {

    override fun sendEmail(toAddress: String, subject: String, body: String) {
        val destination = Destination.builder()
            .toAddresses(appSource)
            .build()

        val content = Content.builder()
            .data(toAddress+"\n"+body)
            .build()

        val subjectContent = Content.builder()
            .data(subject)
            .build()

        val message = Message.builder()
            .subject(subjectContent)
            .body(Body.builder().text(content).build())
            .build()

        val request = SendEmailRequest.builder()
            .source(appSource)
            .destination(destination)
            .message(message)
            .build()

        sesClient.sendEmail(request)
    }
}