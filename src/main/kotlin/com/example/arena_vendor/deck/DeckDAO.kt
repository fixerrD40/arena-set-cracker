package com.example.arena_vendor.deck

import com.example.arena_vendor.api.model.Color
import com.example.arena_vendor.api.model.ColorIdentity
import com.example.arena_vendor.api.model.Deck
import com.example.arena_vendor.api.model.Tri
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Component
import java.sql.ResultSet

@Component
class DeckDAO(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper
) {

    fun deck(id: Int): Deck? {
        val sql = "$SELECT_DECKS $WHERE_CLAUSE;"
        val rowMapper = RowMapper { rs, _ -> rs.getDeck() }

        return jdbcTemplate.query(sql, rowMapper, id).firstOrNull()
    }

    fun decks(): Set<Deck> {
        val sql = "$SELECT_DECKS;"
        val rowMapper = RowMapper { rs, _ ->
            val results = mutableSetOf<Deck>()
            results.add(rs.getDeck())
            while (rs.next()) {
                results.add(rs.getDeck())
            }
            results.toSet()
        }

        return jdbcTemplate.query(sql, rowMapper).firstOrNull()?: emptySet()
    }

    fun deckNames(): Set<String> {
        val sql = "$SELECT_DECKS;"
        val rowMapper = RowMapper { rs, _ ->
            val results = mutableSetOf<String>()
            while (rs.next()) {
                results.add(rs.getString(NAME_COLUMN))
            }
            results.toSet()
        }

        return jdbcTemplate.query(sql, rowMapper).firstOrNull()?: emptySet()
    }

    fun insertDeck(deck: Deck): Boolean =
        jdbcTemplate.update(UPSERT_SQL, deck.name, deck.arenaDeck, deck.arenaDeck) > 0

    fun deleteDeck(id: Int): Boolean =
        jdbcTemplate.update(DELETE_SQL, id) > 0

    fun ResultSet.getDeck() = Deck(
        getInt(ID_COLUMN),
        getString(NAME_COLUMN),
        getString(ARENA_DECK_COLUMN),
        objectMapper.readValue(getString(IDENTITY_COLUMN), object : TypeReference<Set<Color>>() {}).let { ColorIdentity.fromColors(it)},
        objectMapper.readValue(getString(CARDS_COLUMN), object : TypeReference<Map<String, Int>>() {}),
        objectMapper.readValue(getString(TAGS_COLUMN), object : TypeReference<Set<String>>() {}),
        getString(NOTES_COLUMN),
        getTimestamp(CREATED_AT_COLUMN).toInstant()
    )

    companion object {
        private const val TABLE = "decks"

        private const val ID_COLUMN = "id"
        private const val NAME_COLUMN = "name"
        private const val ARENA_DECK_COLUMN = "arena_deck"
        private const val IDENTITY_COLUMN = "identity"
        private const val CARDS_COLUMN = "cards"
        private const val TAGS_COLUMN = "tags"
        private const val NOTES_COLUMN = "notes"
        private const val CREATED_AT_COLUMN = "created_at"

        private const val CONSTRAINT_NAME = "decks_name_unique"
        private const val WHERE_CLAUSE = "WHERE $ID_COLUMN = ?"

        private const val SELECT_DECKS = "SELECT * FROM $TABLE"

        private val UPSERT_SQL = """
            INSERT INTO $TABLE ($NAME_COLUMN, $ARENA_DECK_COLUMN)
            VALUES (?, ?)
                ON CONFLICT ON CONSTRAINT $CONSTRAINT_NAME
                    DO UPDATE SET $ARENA_DECK_COLUMN = ?;
        """.trimIndent()

        private const val DELETE_SQL = "DELETE FROM $TABLE $WHERE_CLAUSE;"
    }
}