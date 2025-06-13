package com.example.arena_set_cracker.logging

import org.slf4j.MDC

object Mdcs {
    const val SET = "set"

    object RequestContext {
        val set: String
            get() = MDC.get(SET) ?: throw IllegalStateException("Missing set context")
    }
}