# bare-macos — a peer-to-peer shared switch, showcasing Bare embedded in a
# native macOS app. `make` takes a clean checkout all the way to a built app.

BARE_KIT_VERSION ?= v2.1.3
APP := build/Build/Products/Debug/BareSwitch.app

.PHONY: all setup framework gen pack link addons project build run run2 test clean

all: setup build

# Everything needed before Xcode can build, in dependency order.
setup: node_modules framework gen pack link addons project

# Native addon prebuilds ship inside the packages, so postinstall scripts are
# not needed to build the app. `--ignore-scripts` matches CI (holepunch's
# node-base action) and keeps installs fast.
node_modules:
	npm install --ignore-scripts

# Download the prebuilt macOS BareKit framework (the V8 build) only if it is
# missing. To refresh after bumping BARE_KIT_VERSION, run `make clean` (or
# `rm -rf app/frameworks`) first.
framework: app/frameworks/BareKit.xcframework

app/frameworks/BareKit.xcframework:
	@mkdir -p tmp
	gh release download $(BARE_KIT_VERSION) --repo holepunchto/bare-kit \
		--pattern prebuilds.zip --dir tmp --clobber
	cd tmp && unzip -oq prebuilds.zip 'darwin/*'
	@mkdir -p app/frameworks
	mv tmp/darwin/BareKit.xcframework app/frameworks/
	rm -rf tmp

# One schema -> JS (spec/) and Swift (swift/) packages.
gen:
	npm run gen

# Bundle the worklet JS (+ deps) into app/app.bundle.
pack:
	npm run pack

# Resolve native addons (udx-native, sodium-native, ...) into app/addons/.
link:
	npm run link

# Derive app/addons/addons.yml from the linked frameworks.
addons:
	npm run addons

# Generate the Xcode project from project.yml.
project:
	xcodegen generate

build:
	xcodebuild -project BareSwitch.xcodeproj -scheme BareSwitch \
		-configuration Debug -derivedDataPath build \
		CODE_SIGNING_ALLOWED=NO build

run: build
	open "$(APP)"

# Launch a second instance to see the switch sync peer-to-peer.
run2:
	open -n "$(APP)"

test:
	npm test

clean:
	rm -rf build *.xcodeproj spec swift/schema swift/hrpc \
		app/app.bundle app/addons app/frameworks tmp
