package com.example.arena_set_cracker.scryfall

import com.example.arena_set_cracker.scryfall.model.SetListResponse
import org.springframework.cloud.openfeign.FeignClient
import org.springframework.web.bind.annotation.GetMapping

@FeignClient(name = "scryfallClient", url = "https://api.scryfall.com")
interface ScryfallClient {

    @GetMapping("/sets")
    fun getAllSets(): SetListResponse
}