package com.example.arena_vendor.deck

import com.example.arena_vendor.api.model.Deck
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Component
import java.sql.ResultSet

@Component
class DeckDAO(
    private val jdbcTemplate: JdbcTemplate
) {

    fun deck(deckName: String): Deck? {
        val sql = "$SELECT_DECKS $WHERE_CLAUSE;"
        val rowMapper = RowMapper { rs, _ -> rs.getDeck() }

        return jdbcTemplate.query(sql, rowMapper, deckName).firstOrNull()
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

    fun deleteDeck(deckName: String): Boolean =
        jdbcTemplate.update(DELETE_SQL, deckName) > 0

    fun ResultSet.getDeck() = Deck(getString(NAME_COLUMN), getString(ARENA_DECK_COLUMN))

    companion object {
        private const val TABLE = "decks"

        private const val NAME_COLUMN = "name"
        private const val ARENA_DECK_COLUMN = "arena_deck"

        private const val CONSTRAINT_NAME = "decks_name_unique"
        private const val WHERE_CLAUSE = "WHERE $NAME_COLUMN = ?"

        private const val SELECT_DECKS = "SELECT * FROM $TABLE"

        private val UPSERT_SQL = """
            INSERT INTO $TABLE ($NAME_COLUMN, $ARENA_DECK_COLUMN)
            VALUES (?, ?)
                ON CONFLICT ON CONSTRAINT $CONSTRAINT_NAME
                    DO UPDATE SET $ARENA_DECK_COLUMN = ?;
        """.trimIndent()

        private val DELETE_SQL = "DELETE FROM $TABLE $WHERE_CLAUSE;"
    }
}