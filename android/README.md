# Brückenbau Captain – Android-App

Minimale native Android-App (Java, ohne AndroidX), die das Spiel `../index-captain.html` offline in einem WebView lädt.

- Paket: `com.rancher0.bridgeconstructor`, Version 1.0.0 (versionCode 1), minSdk 24, targetSdk 34
- Keine INTERNET-Berechtigung, nur VIBRATE; Vollbild/immersiv, Hardware-Beschleunigung, Drehung erlaubt
- Zurück-Taste: schließt Dialoge / beendet die Testfahrt, sonst zweimal Zurück zum Beenden

## Bauen

```bash
# JDK 17 + Android SDK (platform 34, build-tools 34.0.0) nötig
echo "sdk.dir=/pfad/zum/android-sdk" > local.properties
./gradlew assembleRelease -PsigningProps=/pfad/zu/keystore.properties
```

Vor jedem Build wird `../index-captain.html` nach `app/src/main/assets/index.html` kopiert.
Ohne `signingProps` (Standard: `../android-signing/keystore.properties`, liegt nie im Repo) entsteht eine unsignierte Release-APK.
`keystore.properties` enthält `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.
