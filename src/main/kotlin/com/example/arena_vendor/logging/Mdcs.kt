package com.example.arena_vendor.logging

import org.slf4j.MDC

object Mdcs {
    const val SET = "set"

    object RequestContext {
        val set: Int
            get() = MDC.get(SET).toIntOrNull() ?: throw IllegalStateException("Missing set context")
    }
}