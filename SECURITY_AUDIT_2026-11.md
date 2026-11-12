# Audit sécurité et maintenance — elgato-streamdeck-ai-paints

Commit audité : `81a4a05e2c118b91c292f0be59a3aac1f8348a88`. Branche de correction : `security/audit-maintenance-2026-11`.

## Accès et limites

Audit du 12 novembre 2026, sur un clone superficiel de la branche par défaut. Aucune production ni aucun secret ou paramètre GitHub modifié. Les résultats ne constituent pas une certification d'absence de vulnérabilité.

- API Dependabot et Secret Scanning : HTTP 403, « Resource not accessible by integration ». Nombre et sévérité des alertes GitHub inconnus, jamais assimilés à zéro.
- Code Scanning : GitHub indique non activé sur les trois dépôts privés ; HTTP 403 sans conclusion sur son activation pour Stream Deck.
- PR ouvertes consultées via API. Aucun changement d'état ni fermeture manuelle d'alerte.
- Installations npm propres effectuées avec `npm ci --ignore-scripts --no-audit --no-fund`. Tests et builds exécutés explicitement ensuite. Node 24.22.1 ; Python 3.12.14 ; PHP absent.
- Syntaxe YAML chargée avec PyYAML et `git diff --check` exécuté. Ceci ne remplace pas actionlint ni une exécution des workflows GitHub/Windows/macOS.
- Historique des secrets non audité exhaustivement : clone superficiel. Aucun fichier suivi `.env`, clé PEM/KEY ou `config.json` détecté par le contrôle des noms ; cela ne prouve pas l'absence de secrets dans le contenu ou l'historique.

## Architecture et risques

Plugin Stream Deck TypeScript/ESM, @elgato/streamdeck 2.1.2, Node runtime manifest, Rollup et inspecteur de propriétés. Endpoints Cloudflare AI fixes, identifiant de compte encodé ; tests de masquage des logs et migration des paramètres présents. Les tokens sont des paramètres globaux Stream Deck : sécuriser les profils/sauvegardes du poste ; aucun secret changé par cet audit.

Workflow publish-release interpolait inputs.version directement dans du code PowerShell double-quoté puis dans gh release. Cela permet une injection PowerShell par une entrée telle que $(), avant contrôle de concordance de version. Le déclenchement est réservé à un opérateur workflow_dispatch et à main : ce n'est pas une attaque PR anonyme. La réduction du risque reste justifiée sur un job disposant d'un token de release.

## Corrections et validation

Passage de la version via RELEASE_VERSION dans l'environnement, utilisation de $env:RELEASE_VERSION dans PowerShell et validation du format avant opérations. Aucune interpolation de cette entrée dans le source PowerShell restante. Aucun workflow exécutant une release déclenché.

serialize-javascript 7.1.2 → 7.1.4 dans le lockfile, même correctif que la PR Dependabot #7. GHSA-m5mm-p8h7-m29v concerne une sortie de sérialisation utilisée dans un script HTML ; ici dépendance de build Terser, pas de chemin sensible depuis une entrée utilisateur démontré. Le paquet affecté est néanmoins supprimé.

Typecheck, ESLint, 52 tests, build Rollup passent. Validateur Stream Deck passe après activation du proxy Node fourni (NODE_USE_ENV_PROXY=1) ; le premier essai était bloqué par un fetch direct ECONNREFUSED. Validation effectuée en dry-run, pas de publication. PowerShell/Stream Deck matériel et workflow Windows non exécutés localement : un dry-run Windows de la logique de release reste nécessaire.

Audit final : 12 dépendances signalées, dont 3 élevées par propagation de zod vers @elgato/utils/streamdeck. Zod <4.6.6 peut épuiser la mémoire sur des collections surdimensionnées. Le SDK verrouille une génération Zod différente ; imposer une majeure Zod pourrait casser le protocole. Pas de changement automatique de SDK 2 → 3 ni de downgrade SDK 1 proposé par npm. Examiner avec l'éditeur le correctif compatible, puis vérifier les messages WebSocket Stream Deck qui atteignent les schémas ; exploit distant Internet non démontré. Sept alertes modérées sont principalement liées au tooling/typescript-eslint/minimatch, deux faibles à deepmerge/son parent.

Risque de régression faible pour le correctif transitif de build ; format de version plus strict (x.y.z avec prérelease) à vérifier avec les habitudes de publication. Après fusion l'alerte serialize-javascript devrait disparaître ; les autres restent.

## Maintenance

SDK 3 et ESLint 10 sont des migrations à tester séparément, pas des correctifs à imposer en compétition. ESLint 9.39.5 est signalé hors support par npm. CI Windows existe ; pas de pull_request_target. Épinglage des actions à des SHA, checkout sans credentials persistants et séparation build/release sont des durcissements facultatifs à planifier après validation des workflows existants.

## Inventaire npm avant/après

Les nombres ci-dessous sont des paquets signalés par npm, pas les alertes GitHub inaccessibles.

| État | Total | Critiques | Élevées | Modérées | Faibles |
|---|---:|---:|---:|---:|---:|
| Avant | 13 | 0 | 3 | 7 | 3 |
| Après | 12 | 0 | 3 | 7 | 2 |

Avis directs restants (la propagation aux parents explique les compteurs) :

- deepmerge : deepmerge mergeObject() allows prototype poisoning of returned objects ; plage `>=4.2.0 <=4.3.1` ; https://github.com/advisories/GHSA-gcqx-w48m-w2h4.
- minimatch : minimatch has potential denial of service via globparts amplification ; plage `>=7.0.0 <11.0.1` ; https://github.com/advisories/GHSA-g3hv-75wg-m249.
- zod : Zod can exhaust memory while validating oversized constrained collections ; plage `<4.6.6` ; https://github.com/advisories/GHSA-mrhx-c7xc-m3w5.

## Plan des six prochains mois

Traiter les dépendances runtime restantes en priorité et valider sur une copie de production. Chaque mois : revue des avis et PR Dependabot, audit avec outils natifs, installation propre et tests. Avant chaque course : simulation de perte réseau, reprise et publication ; conserver une version connue fonctionnelle. Trimestriellement : revue des runtimes supportés, sauvegardes/restauration et accès aux postes. Tester les migrations majeures hors période de compétition. Les durcissements facultatifs de CI ne remplacent pas les correctifs runtime.

## Dépendances directes obsolètes relevées

@elgato/streamdeck 2.1.2 → 3.0.4
Relevé npm outdated sans --include=dev : inventaire incomplet des outils de développement ; les avis de sécurité transitifs sont couverts séparément par npm audit.

## Information GitHub complémentaire au push

Le bandeau GitHub reçu lors du push annonce 3 vulnérabilité(s) sur la branche par défaut : 1 élevée, 2 faibles. Ce résumé ne donne ni tous les identifiants ni les chemins affectés ; les API détaillées restent interdites (403). Il ne reflète pas une réanalyse de cette branche de correction.
