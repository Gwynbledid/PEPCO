#!/usr/bin/env bash
# Copy the canonical glTF exports into the Godot project's res:// tree.
# exports/ is engine-neutral and is what the repo tracks; godot/assets/ is a
# generated duplicate that Godot needs inside the project directory.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p godot/assets
cp -v exports/*.glb godot/assets/
echo "Synced $(ls exports/*.glb | wc -l) files. Open the Godot project to reimport."
