package com.example.arena_set_cracker.service

import com.example.arena_set_cracker.security.JwtRequestFilter.Companion.getAuthenticatedUserIdOrNull
import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentHashMap

object JobManager {

    // userId -> Job
    private val runningJobs = ConcurrentHashMap<String, Job>()
    private val coroutineScope = CoroutineScope(Dispatchers.IO)

    fun <T> submitJob(task: suspend () -> T): Deferred<T> {
        val userId = getAuthenticatedUserIdOrNull()!!

        // Optional: cancel existing job if running
        runningJobs[userId]?.cancel()

        val deferredResult = coroutineScope.async {
            task()
        }

        runningJobs[userId] = deferredResult

        deferredResult.invokeOnCompletion { throwable ->
            runningJobs.remove(userId)

            if (throwable != null) {
                println("Job for user [$userId] failed: ${throwable.message}")
                throwable.printStackTrace()
            }
        }

        return deferredResult
    }

    fun cancelJob() {
        val userId = getAuthenticatedUserIdOrNull()!!
        runningJobs[userId]?.cancel()
        runningJobs.remove(userId)
    }
}
