plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}
android {
    namespace = "za.co.mythuso"
    compileSdk = 35
    defaultConfig { applicationId = "za.co.mythuso.preview"; minSdk = 26; targetSdk = 35; versionCode = 1; versionName = "0.1.0" }
    buildFeatures { compose = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    /* R8 is what keeps material-icons-extended honest: the library carries thousands of icons and this
       app draws 84, so the debug build is 23 MB and the shrunk release build's whole dex is 2.7 MB.
       Resource shrinking removes what the code no longer references. */
    buildTypes { release { isMinifyEnabled = true; isShrinkResources = true; proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt")) } }
    /* Lint runs on every build, and the accessibility checks it can make statically are errors
       rather than warnings — a warning in a build log is a thing nobody reads twice. It does not
       catch much: most of these screens are Compose, and Compose accessibility is largely beyond
       what static analysis sees. What it does catch is an icon or an image with no description and
       a control the framework can measure, and those are worth failing a build over. The rest —
       touch targets on `Modifier.clickable`, whether a row drawn as a checkbox announces itself as
       one — was read by hand, and docs/ACCESSIBILITY.md says so rather than implying lint found it. */
    lint {
        abortOnError = true
        error += listOf("ContentDescription", "ClickableViewAccessibility", "KeyboardInaccessibleWidget", "LabelFor")
    }
}
dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.04.01"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
