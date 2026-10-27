#!/bin/sh
# Xcode Cloud runs this after it clones the repository and before it resolves
# Swift packages (it looks for ci_scripts/ beside App.xcodeproj).
#
# The Capacitor plugins are Swift packages that live in node_modules
# (CapApp-SPM/Package.swift), and the web app the shell carries is built, not
# committed (App/public is ignored). So the clone alone cannot build: this
# installs Node, then does what a developer does before opening Xcode,
# `npm ci` and `npm run build:ios` (ADR-155).
set -eu

# The Node the rest of the project builds with (.github/workflows/ci.yml).
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
brew install node@22
export PATH="$(brew --prefix node@22)/bin:$PATH"
node --version

cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci
npm run build:ios
