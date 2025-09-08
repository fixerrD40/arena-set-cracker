package com.example.arena_set_cracker.service

interface MailService {

    fun sendEmail(toAddress: String, subject: String, body: String)
}