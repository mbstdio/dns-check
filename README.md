<div align="center">
  <div>
    <h1 align="center">@mbstudio/dns-check</h1>
  </div>
	<p>A command-line tool that compares a DNS record across multiple resolvers.</p>
	<a href="https://www.npmjs.com/package/@mbstudio/dns-check"><img src="https://img.shields.io/npm/v/@mbstudio/dns-check?style=flat&colorA=444&colorB=199dda" alt="Current version"></a>
	<a href="https://www.npmjs.com/package/@mbstudio/dns-check?activeTab=versions"><img src="https://img.shields.io/npm/dm/@mbstudio/dns-check.svg?style=flat&colorA=444&colorB=8abe2f" alt="Downloads"></a>
	<a href="https://github.com/mbstdio/dns-check"><img src="https://img.shields.io/github/stars/mbstdio/dns-check?style=flat&colorA=444&colorB=efce07" alt="Stars"></a>
</div>

## Installation

```bash
npm install --global @mbstudio/dns-check
```

## Usage

```bash
# The A record type is used by default
dns-check example.com

# Query a different record type
dns-check example.com -t NS
dns-check example.com --type MX

# Check whether a specific value is returned
dns-check example.com --expected 93.184.216.34
dns-check example.com -t NS -e a.iana-servers.net
```

With `-e` or `--expected`, the **Status** column shows `✓ OK` when the expected value is present in the resolver response, or `✗ NO` otherwise. Resolution errors remain displayed as `✗ Failed`.

By default, the following public resolvers are queried: Google (`8.8.8.8`), Cloudflare (`1.1.1.1`), Quad9 (`9.9.9.9`), OpenDNS (`208.67.222.222`), AdGuard DNS (`94.140.14.14`), CleanBrowsing (`185.228.168.9`), Completel - SAS (`83.145.86.7`), ServiHosting Networks S.L. (`84.236.142.130`), Universitaet Leipzig (`139.18.25.33`), Universidad LatinoAmericana S.C. (`200.33.3.123`), Swisscom AG (`195.186.1.111`), and NTT (`118.3.227.163`).

Some of these resolvers apply protection against malicious domains or content filtering. A different result may therefore be intentional, rather than a DNS propagation issue.

## Add a resolver

```bash
dns-check add -ip 9.9.9.9 -name Quad9
```

Added resolvers are saved in your system configuration directory and included in future checks.

```bash
dns-check resolvers
dns-check remove Quad9
```

## Development and publishing

```bash
npm install
npm run build
npm run release:check
```

## Publish to npm

The package is configured to publish publicly under the `@mbstudio` scope. After
authenticating to the npm account that owns that scope, publish it with:

```bash
npm login
npm publish
```

`prepack` and `prepublishOnly` compile the project before packaging and
publishing. `publishConfig.access` ensures that this scoped package is public.
