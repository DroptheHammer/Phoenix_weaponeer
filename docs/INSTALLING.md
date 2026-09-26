# Installing Phoenix Weaponeer

Download the installer for your OS from the [latest release](https://github.com/DroptheHammer/Phoenix_weaponeer/releases/latest) on GitHub.

- **Windows:** `Phoenix.Weaponeer_<version>_x64-setup.exe` — installs to your
  user profile (`%LOCALAPPDATA%\Phoenix Weaponeer`), no admin rights needed.
  The installer lets you pick a different folder if you want one. There is
  also a `Phoenix.Weaponeer_<version>_x64_en-US.msi`, the Windows Installer
  package IT departments prefer; most people want the `-setup.exe`.
- **macOS:** `Phoenix.Weaponeer_<version>_aarch64.dmg` — open it and drag
  Phoenix Weaponeer into the Applications shortcut shown.
- **Linux:** `Phoenix.Weaponeer_<version>_amd64.deb` (Debian/Ubuntu,
  `sudo dpkg -i ...`), `Phoenix.Weaponeer-<version>-1.x86_64.rpm`
  (Fedora/openSUSE, `sudo rpm -i ...`), or
  `Phoenix.Weaponeer_<version>_amd64.AppImage` (any distro — `chmod +x` it and
  run it directly, no install step).

## "Unknown publisher" warnings

These installers aren't signed with a paid code-signing certificate (Windows)
or notarized through an Apple Developer account (macOS) — those cost money
per year and this is a free tool built for squadron use. Your OS will warn you
the first time you run it. This is expected, not a sign anything is wrong:

- **Windows SmartScreen:** you'll see "Windows protected your PC." Click
  **More info**, then **Run anyway**.
- **macOS Gatekeeper:** you'll see the app "cannot be opened because the
  developer cannot be verified" (or similar). **Right-click the app → Open**,
  then confirm in the dialog that appears — this only has to be done once. If
  right-click → Open doesn't offer to bypass it, run this in Terminal instead:
  ```
  xattr -cr /Applications/Phoenix\ Weaponeer.app
  ```
- **Linux:** no equivalent warning — package managers don't gate on code
  signing the same way.

If you'd rather build from source and skip all of this, see the main
`CLAUDE.md` for the dev setup.
