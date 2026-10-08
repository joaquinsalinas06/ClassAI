// AGP 9 trae Kotlin integrado: no hace falta el plugin org.jetbrains.kotlin.android
plugins {
    id("com.android.application")
}

android {
    namespace = "com.classai.mobile"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.classai.mobile"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1"
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
