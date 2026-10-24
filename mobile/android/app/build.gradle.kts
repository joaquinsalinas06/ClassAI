import java.util.Properties
import java.net.URI

// AGP 9 trae Kotlin integrado: no hace falta el plugin org.jetbrains.kotlin.android
plugins {
    id("com.android.application")
}

// Internal build configuration, never a field in the student experience.
val localEnv = Properties().apply {
    val file = rootProject.file(".env")
    if (file.exists()) file.inputStream().use { load(it) }
}
val classaiApiUrl = (providers.environmentVariable("CLASSAI_API_URL").orNull
    ?: localEnv.getProperty("CLASSAI_API_URL") ?: "http://10.0.2.2:8000").trim().trimEnd('/')
val apiUri = URI(classaiApiUrl)
require(apiUri.scheme in listOf("http", "https") && apiUri.host != null &&
    apiUri.userInfo == null && apiUri.query == null && apiUri.fragment == null) {
    "CLASSAI_API_URL must be an http(s) base URL without credentials, query or fragment"
}

android {
    namespace = "com.classai.mobile"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.classai.mobile"
        minSdk = 26
        targetSdk = 36
        versionCode = 3
        versionName = "0.3"
        buildConfigField("String", "CLASSAI_API_URL", "\"${classaiApiUrl.replace("\\", "\\\\").replace("\"", "\\\"")}\"")
    }

    buildFeatures {
        viewBinding = true
        buildConfig = true
    }
}

dependencies {
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    testImplementation("junit:junit:4.13.2")
}
