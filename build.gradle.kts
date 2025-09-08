plugins {
    kotlin("jvm") version "2.1.21"
    kotlin("plugin.jpa") version "2.1.21"
    id("org.jetbrains.kotlin.plugin.spring") version "1.9.25"
    id("org.springframework.boot") version "3.5.0"
    id("io.spring.dependency-management") version "1.1.7"
    id("com.bmuschko.docker-spring-boot-application") version "9.4.0"
    id("com.avast.gradle.docker-compose") version "0.17.12"
}

val group = "com.example"
val version = "0.0.1-SNAPSHOT"

val awsSdkVersion = "2.33.4"
val springCloudVersion = "2025.0.0"

repositories {
    mavenCentral()
}

dependencyManagement {
    imports {
        mavenBom("org.springframework.cloud:spring-cloud-dependencies:$springCloudVersion")
    }
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")

    implementation("org.jetbrains.kotlin:kotlin-reflect")
    implementation("org.springframework.boot:spring-boot-starter")
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-jdbc")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-mail")

    implementation("org.springframework.cloud:spring-cloud-starter-openfeign")

    implementation("com.github.ben-manes.caffeine:caffeine:3.2.2")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.18.2")
    implementation("io.swagger.core.v3:swagger-annotations-jakarta:2.2.28")
    implementation("org.liquibase:liquibase-core:4.31.0")
    implementation("org.postgresql:postgresql:42.7.5")

    // aws_>solving problems
    implementation("software.amazon.awssdk:ses:$awsSdkVersion")
    implementation("software.amazon.awssdk:regions")

    // jjwt
    implementation("io.jsonwebtoken:jjwt-api:0.11.5")
    runtimeOnly("io.jsonwebtoken:jjwt-impl:0.11.5")
    runtimeOnly("io.jsonwebtoken:jjwt-jackson:0.11.5")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testRuntimeOnly ("org.junit.platform:junit-platform-launcher")
}

kotlin {
    compilerOptions.apply {
        freeCompilerArgs.addAll("-Xjsr305=strict")
    }
}

tasks.test {
    useJUnitPlatform()
}

dockerCompose {
    useComposeFiles.set(listOf("src/main/resources/docker-compose.yml"))
}

dockerCompose.isRequiredBy(tasks.test)