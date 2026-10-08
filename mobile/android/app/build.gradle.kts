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
        versionCode = 2
        versionName = "0.2"
    }

    buildFeatures {
        viewBinding = true
    }
}

dependencies {
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    testImplementation("junit:junit:4.13.2")
}
