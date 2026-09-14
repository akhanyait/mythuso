plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}
android {
    namespace = "za.co.mythuso"
    compileSdk = 35
    defaultConfig {
        applicationId = "za.co.mythuso.preview"; minSdk = 26; targetSdk = 35; versionCode = 1; versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
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

    /* The instrumented accessibility audit in app/src/androidTest. Every line below is `androidTest`
       or `debug`, which is what keeps it out of the shipped artifact — `androidTestImplementation`
       compiles into a test APK of its own and `ui-test-manifest` is a debug-only manifest merge.
       That was verified rather than assumed: `:app:assembleRelease` gives 2 378 357 bytes before
       these six lines and 2 378 357 bytes after, the same to the byte, and the release dex carries
       no reference to espresso, junit or androidx.test. The check is `:app:assembleRelease` and
       `ls -l`; the numbers are also in docs/ACCESSIBILITY.md. */
    androidTestImplementation(platform("androidx.compose:compose-bom:2025.04.01"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation("androidx.test:core:1.6.1")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    /* A JVM unit test, for model code with no Android in it: Gilbert's matcher run against the shared
       fixtures in packages/catalog/assistant.json. `testImplementation` compiles into nothing shipped. */
    testImplementation("junit:junit:4.13.2")
}
