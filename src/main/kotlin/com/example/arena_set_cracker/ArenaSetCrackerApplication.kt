package com.example.arena_set_cracker

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.cloud.openfeign.EnableFeignClients

@SpringBootApplication
@EnableFeignClients
class ArenaSetCrackerApplication

fun main(args: Array<String>) {
	runApplication<ArenaSetCrackerApplication>(*args)
}
