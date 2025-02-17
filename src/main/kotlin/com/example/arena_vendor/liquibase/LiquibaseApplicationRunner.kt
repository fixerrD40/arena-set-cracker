package com.example.arena_vendor.liquibase

import liquibase.integration.spring.SpringLiquibase
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.boot.autoconfigure.liquibase.LiquibaseProperties
import org.springframework.stereotype.Component
import javax.sql.DataSource

@Component
class LiquibaseApplicationRunner(
    private val dataSource: DataSource,
    private val liquibaseProperties: LiquibaseProperties
): ApplicationRunner {

    override fun run(args: ApplicationArguments) {
        val liquibase = SpringLiquibase()

        liquibase.dataSource = dataSource
        liquibase.changeLog = liquibaseProperties.changeLog

        liquibase.afterPropertiesSet()
    }
}