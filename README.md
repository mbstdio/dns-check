# dns-check

Un outil en ligne de commande qui compare une entrée DNS chez plusieurs résolveurs.

## Installation

```bash
npm install --global dns-check
```

## Utilisation

```bash
# Le type A est utilisé par défaut
dns-check example.com

# Interroger un autre type d'entrée
dns-check example.com -t NS
dns-check example.com --type MX
```

Par défaut, les résolveurs publics suivants sont interrogés : Google (`8.8.8.8`), Cloudflare (`1.1.1.1`), Quad9 (`9.9.9.9`), OpenDNS (`208.67.222.222`), AdGuard DNS (`94.140.14.14`), CleanBrowsing (`185.228.168.9`), Completel - SAS (`83.145.86.7`), ServiHosting Networks S.L. (`84.236.142.130`), Universitaet Leipzig (`139.18.25.33`) et Universidad LatinoAmericana S.C. (`200.33.3.123`).

Certains de ces résolveurs appliquent une protection contre les domaines malveillants ou du filtrage de contenu. Un résultat différent peut donc être intentionnel, et pas nécessairement un problème de propagation DNS.

## Ajouter un résolveur

```bash
dns-check add -ip 9.9.9.9 -name Quad9
```

Les résolveurs ajoutés sont enregistrés dans le répertoire de configuration de votre système et seront inclus dans les prochains tests.

```bash
dns-check resolvers
dns-check remove Quad9
```

## Développement et publication

```bash
npm install
npm run build
npm publish
```

`prepublishOnly` compile automatiquement le projet avant une publication npm.
