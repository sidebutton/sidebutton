# Chrome managed policy

`sidebutton.json` is a Chrome/Chromium [managed policy][policy] that force-installs
the published SideButton extension from the Chrome Web Store. It is the entire
mechanism by which the `browser` container profile acquires the extension.

## Why a policy instead of shipping the extension

The extension is licensed **FSL-1.1-Apache-2.0** and is distributed *only* through
the Chrome Web Store — `sync-oss.sh` deliberately excludes `extension/` from the
public mirror. A container image therefore cannot copy the source, and an image
that embedded it could not be built by Docker from the public repository nor
redistributed under the mirror's Apache-2.0 terms.

Force-install sidesteps both problems: the image carries these four lines, and
the browser fetches the signed CRX from Google at first launch. Nothing is
redistributed, no source is needed, and the extension auto-updates without
re-pinning the catalog entry.

This is the same mechanism the agent fleet uses — see `docs/agents/deployment.md`
§ *SideButton Chrome Extension*, which writes this identical policy to
`/etc/opt/chrome/policies/managed/sidebutton.json`.

## Contents

| Field | Value |
| --- | --- |
| Extension ID | `odaefhmdmgijnhdbkfagnlnmobphgkij` |
| Update URL | `https://clients2.google.com/service/update2/crx` |

The ID must match the [Web Store listing][listing]. If it ever changes, this file
and `docs/agents/deployment.md` both need updating.

## Install path

The path is browser-specific, and the Dockerfile installs to the Chromium one:

| Browser | Policy directory |
| --- | --- |
| Chromium (used by the `browser` profile) | `/etc/chromium/policies/managed/` |
| Google Chrome (used by the agent fleet) | `/etc/opt/chrome/policies/managed/` |

## Network requirement

First launch needs egress to `clients2.google.com` (update check) and
`clients2.googleusercontent.com` (CRX download). Without them the browser starts
but no extension installs, and every browser tool reports "Browser not connected".
A catalog entry that sets `run.disableNetwork` would break this profile.

[policy]: https://chromeenterprise.google/policies/#ExtensionInstallForcelist
[listing]: https://chromewebstore.google.com/detail/sidebutton/odaefhmdmgijnhdbkfagnlnmobphgkij
