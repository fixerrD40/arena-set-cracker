package com.example.arena_set_cracker.service

import com.example.arena_set_cracker.scryfall.ScryfallClient
import com.example.arena_set_cracker.scryfall.model.CardListResponse
import com.example.arena_set_cracker.scryfall.model.ScryfallCard
import com.example.arena_set_cracker.scryfall.model.ScryfallSet
import com.example.arena_set_cracker.scryfall.model.SetListResponse
import com.github.benmanes.caffeine.cache.Caffeine
import org.springframework.stereotype.Service
import java.util.concurrent.TimeUnit

@Service
class CachedScryfallService(
    private val scryfallClient: ScryfallClient
) {

    private val setListCache = Caffeine.newBuilder()
        .expireAfterWrite(1, TimeUnit.HOURS)
        .maximumSize(1)
        .build<String, SetListResponse>()

    private val cardListCache = Caffeine.newBuilder()
        .expireAfterWrite(30, TimeUnit.MINUTES)
        .maximumSize(100) // one per set
        .build<String, CardListResponse>()

    fun getAllSets(): SetListResponse {
        return setListCache.get("sets") {
            scryfallClient.getAllSets()
        }
    }

    fun getSetByCode(code: String): ScryfallSet? {
        val allSets = getAllSets()
        return allSets.data.find { it.code.equals(code, ignoreCase = true) }
    }

    fun getCardsBySetCode(setCode: String): List<ScryfallCard> {
        val validSet = getSetByCode(setCode)
            ?: throw IllegalArgumentException("Invalid set code: $setCode")

        return cardListCache.get(setCode.lowercase()) {
            scryfallClient.getCardsBySet("set:${setCode.lowercase()}")
        }.data
    }
}