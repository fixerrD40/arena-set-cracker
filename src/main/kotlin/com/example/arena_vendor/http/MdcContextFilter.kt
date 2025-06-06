package com.example.arena_vendor.http

import com.example.arena_vendor.logging.Mdcs
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.MDC
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

@Component
class MdcContextFilter : OncePerRequestFilter() {

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain
    ) {
        try {
            val set = extractSet(request)
            if (set != null) MDC.put(Mdcs.SET, set)

            filterChain.doFilter(request, response)
        } finally {
            MDC.clear()
        }
    }

    private fun extractSet(request: HttpServletRequest): String? {
        return request.getHeader("X-Set")
    }
}