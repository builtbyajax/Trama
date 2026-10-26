fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rerun-if-changed=src/relaunch-macos.swift");
        let arch = match std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
            Ok("aarch64") => "arm64",
            Ok("x86_64") => "x86_64",
            _ => panic!("unsupported macOS architecture"),
        };
        let output =
            std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("trama-relaunch");
        let status = std::process::Command::new("/usr/bin/swiftc")
            .args(["-O", "-swift-version", "5", "-target"])
            .arg(format!("{arch}-apple-macosx14.0"))
            .arg("src/relaunch-macos.swift")
            .arg("-o")
            .arg(output)
            .status()
            .expect("could not run the Swift compiler for the macOS relaunch helper");
        assert!(
            status.success(),
            "could not compile the macOS relaunch helper"
        );
    }
    tauri_build::build()
}
