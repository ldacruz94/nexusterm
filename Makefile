.PHONY: dev build release clean

dev:
	npm run tauri dev

build:
	npm run tauri build

release:
	npm run tauri build --release

clean:
	cargo clean --manifest-path src-tauri/Cargo.toml
	rm -rf dist
