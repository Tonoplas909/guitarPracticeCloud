# Guitar Practice Cloud

Un site de **stockage et de travail de fichiers audio** : on y importe ses
pistes, on les classe, et on les écoute dans un lecteur pensé pour répéter un
passage — visualiseur temps réel, forme d'onde, boucle A → B, vitesse réglable
et égaliseur.

Angular 22 (Signals, composants standalone) devant une API Express + MongoDB.
Les métadonnées vivent dans MongoDB, les octets audio sur le disque du serveur.

---

## Fonctionnalités

**Bibliothèque** — pagination côté serveur, recherche sur le titre et le nom de
fichier, tri (date, titre, poids, écoutes), filtres par format, par favori et
par étiquette, import de plusieurs fichiers d'un coup avec une barre de
progression par fichier, suppression confirmée en deux temps, tableau de bord
(chiffres clés et répartition par format).

**Lecteur** — barre fixée en bas d'écran qui **survit à la navigation**,
visualiseur en trois rendus (spectre, oscilloscope, et un « sillon » circulaire
qui sert de pochette), forme d'onde cliquable calculée sans requête
supplémentaire, file d'attente, lecture aléatoire, répétition, et une « scène »
plein écran.

**Pour travailler un morceau** — boucle A → B, vitesse de 0,5× à 1,5× sans
désaccorder (`preservesPitch`), et égaliseur trois bandes : creuser les médiums
permet de s'entendre jouer par-dessus la piste.

**Confort** — deux thèmes complets (papier / encre) suivant au besoin la
préférence du système, raccourcis clavier, interface utilisable au clavier et
contrastes mesurés.

Formats acceptés : MP3, WAV, OGG, M4A — 25 Mo maximum par fichier.

> Les favoris, étiquettes et compteurs d'écoute sont enregistrés **dans le
> navigateur** (`localStorage`) : l'API ne prévoit pas de route pour eux. Ils ne
> suivent donc pas d'un appareil à l'autre, et l'application le dit
> explicitement dans la page Profil.

---

## Prérequis

- Node.js 22 ou plus récent ;
- un cluster MongoDB (un cluster gratuit MongoDB Atlas suffit) ;
- un navigateur récent. Le visualiseur et l'égaliseur utilisent l'API Web
  Audio ; sans elle, la lecture fonctionne quand même, sans l'image.

## Démarrer le backend

```bash
cd backend
cp .env.example .env
npm install
npm start
```

Renseigner dans `backend/.env` :

| Variable | Rôle |
|---|---|
| `MONGODB_URI` | URI de connexion, **avec le nom de la base** avant le `?` — par exemple `…mongodb.net/guitar-practice-cloud?retryWrites=true&w=majority` |
| `JWT_SECRET` | une longue chaîne aléatoire, propre à votre installation |
| `PORT` | `3000` par défaut |

Ce fichier ne doit jamais être publié, et aucun secret ne doit être recopié dans
le code Angular. L'API écoute sur `http://localhost:3000` ; vérification :
`http://localhost:3000/api/health`.

Au premier démarrage, un compte de démonstration est créé :
`demo@example.com` / `Demo1234!`.

## Démarrer le frontend

Dans un autre terminal :

```bash
cd frontend-starter
npm install
npm start
```

Ouvrir `http://localhost:4200`. Le serveur de développement relaie `/api` vers
le backend (`proxy.conf.json`).

Pour les essais, n'importe quel fichier MP3, WAV, OGG ou M4A de moins de 25 Mo
fait l'affaire.

## Vérifier

```bash
cd frontend-starter && npm run build && npm test   # 132 tests, 12 fichiers
cd backend && npm test                             # 11 tests
```

Les tests frontend n'ont besoin **ni du backend ni de MongoDB** :
`provideHttpClientTesting` remplace le transport HTTP par un faux transport que
le test pilote.

---

## Raccourcis clavier

| Touche | Action |
|---|---|
| `Espace`, `K` | lecture / pause |
| `←` `→`, `J` `L` | ± 5 secondes |
| `N` / `P` | piste suivante / précédente |
| `M` | couper / rétablir le son |
| `A` / `B` | poser le début / la fin de la boucle |
| `S` / `R` | aléatoire / mode de répétition |
| `F` | ouvrir / fermer la scène |
| `/` | rechercher |
| `?` | afficher l'aide |
| `Échap` | fermer la scène ou l'aide |

Rien ne se déclenche pendant la saisie dans un champ, et les flèches haut/bas
restent au défilement de la page.

---

## Documentation

- [`API_CONTRACT.md`](API_CONTRACT.md) — routes, authentification et formats
  échangés, plus ce que le frontend assure sans toucher au contrat ;
- [`docs/DIRECTION_ARTISTIQUE.md`](docs/DIRECTION_ARTISTIQUE.md) — la charte
  « Sillon » : jetons de couleur et contrastes mesurés, typographie, formes,
  mouvement, accessibilité, points de rupture ;
- [`docs/ARCHITECTURE_FRONTEND.md`](docs/ARCHITECTURE_FRONTEND.md) — carte des
  services et des composants, flux de lecture, graphe Web Audio, dégradation,
  carte des tests.

Les conventions de code sont dans `backend/AGENTS.md`,
`backend/best-practices.md`, `frontend-starter/AGENTS.md` et
`frontend-starter/best-practices.md`.

---

## Structure

```
backend/            API Express + Mongoose (JWT, upload Multer, flux audio)
frontend-starter/   application Angular 22
docs/               charte graphique et architecture du frontend
API_CONTRACT.md     le contrat HTTP
```

L'état partagé vit dans des services `providedIn: 'root'` —
`PlayerService` (lecture), `LibraryStore` (liste et pagination),
`UploadQueueService` (envois), `TrackMetaService` (favoris et étiquettes),
`AudioEngineService` (graphe Web Audio), `ThemeService` (thème). La barre de
lecture est montée **au-dessus** du `router-outlet` : c'est ce qui permet à la
musique de continuer quand on change de page.

---

## Origine

Ce projet est né d'un sujet de TP Angular en M1 MIAGE : le backend et le contrat
HTTP étaient fournis et ne devaient pas être modifiés. Cette contrainte explique
plusieurs choix assumés et documentés — notamment les favoris stockés côté
navigateur, l'absence de renommage de piste (aucune route `PUT /tracks/:id`), et
l'import multiple découpé côté client puisque l'API n'accepte qu'un fichier par
requête.

Les énoncés et les comptes rendus du TP ne font pas partie de ce dépôt.
