# Architecture et fonctionnalités du frontend

Carte du frontend Angular : ce que fait chaque service, ce que fait chaque
composant, et par où passent les données. Complément de
[`DIRECTION_ARTISTIQUE.md`](DIRECTION_ARTISTIQUE.md) (l'apparence) et de
[`../API_CONTRACT.md`](../API_CONTRACT.md) (le contrat HTTP, **inchangé**).

---

## 1. Le choix central : le lecteur est un service

Dans la version précédente, l'élément `<audio>` et tout l'état de lecture
vivaient dans la page de bibliothèque. Conséquence directe : **aller sur le
profil coupait la musique**, puisque changer de route détruit le composant de
la page.

L'état de lecture a donc été sorti dans
[`PlayerService`](../frontend-starter/src/app/shared/services/player.service.ts)
(`providedIn: 'root'`), et la barre de lecture est montée par la coquille
applicative, **au-dessus du `router-outlet`** :

```
AppComponent (coquille)
├── header (marque, navigation, thème, aide)
├── main
│   └── <router-outlet>      ← seule partie détruite à la navigation
├── <app-stage>              ← scène plein écran (si ouverte)
├── <app-player-bar>         ← barre de lecture + l'UNIQUE <audio>
└── <app-shortcuts-help>     ← aide clavier (si ouverte)
```

Trois conséquences utiles :

1. la lecture survit à la navigation ;
2. trois vues différentes — la barre, la scène, les lignes de la bibliothèque —
   lisent **le même** état, donc elles ne peuvent pas se contredire ;
3. l'élément `<audio>` n'est jamais recréé, ce qui est une **obligation
   technique** : `createMediaElementSource()` ne peut être appelé qu'une seule
   fois par élément, et un élément recréé couperait définitivement le
   visualiseur et l'égaliseur.

---

## 2. Services partagés

Tous dans `src/app/shared/services/`, tous `providedIn: 'root'`.

| Service | Responsabilité | Parle au réseau ? |
|---|---|---|
| `AuthService` | inscription, connexion, profil, jeton | oui |
| `TrackService` | les quatre routes de pistes du contrat | oui |
| `LibraryStore` | liste, pagination, recherche, tri, filtres, statistiques | oui (via `TrackService`) |
| `PlayerService` | file de lecture, lecture, position, boucle A→B, vitesse | oui (le flux audio) |
| `UploadQueueService` | file d'envoi multi-fichiers, progression par fichier | oui |
| `AudioEngineService` | graphe Web Audio : analyse, égaliseur, forme d'onde | non |
| `TrackMetaService` | favoris, étiquettes, compteurs d'écoute (locaux) | non |
| `ThemeService` | thème jour / nuit / système | non |

Dépendances (aucun cycle) :

```
LibraryStore ──▶ TrackService
             └─▶ TrackMetaService
PlayerService ─▶ TrackService
              ├▶ AudioEngineService
              └▶ TrackMetaService
UploadQueueService ─▶ TrackService
```

---

## 3. Composants

| Composant | Rôle |
|---|---|
| `app` | coquille : en-tête, navigation, raccourcis clavier globaux, montage du lecteur et des modales |
| `player-bar` | barre fixée en bas, et **seul** endroit où vit un `<audio>` |
| `stage` | « la scène » : vue plein écran, boucle A→B, vitesse, égaliseur, file d'attente |
| `visualizer` | visualiseur temps réel sur `<canvas>`, trois rendus |
| `waveform` | forme d'onde + contrôle de déplacement, accessible au clavier |
| `tracks-page` | la bibliothèque : assemble import, filtres, liste, pagination |
| `track-row` | une ligne de piste : lecture, favori, étiquettes, file, téléchargement, suppression |
| `upload-panel` | zone de dépôt et file d'envoi |
| `library-stats` | quatre chiffres clés et répartition par format |
| `login-page`, `register-page` | authentification |
| `auth-shell` | mise en page commune aux deux pages ci-dessus (affiche + formulaire) |
| `profile-page` | identité, apparence, données locales |
| `shortcuts-help` | aide clavier et choix du thème |
| `icon` | jeu d'icônes SVG déclaré en TypeScript |

---

## 4. Le flux de lecture, de bout en bout

Le flux audio est protégé par le JWT : on ne peut donc **pas** poser l'URL de
l'API dans `src`, car le navigateur enverrait cette requête sans passer par
`HttpClient` ni par l'intercepteur, et recevrait un `401`.

```
clic sur ▶ dans une ligne
   │
   ▼
TracksPageComponent.play(track)
   │  passe la liste VISIBLE comme contexte
   ▼
PlayerService.play(track, contexte)
   │  la liste visible devient la file de lecture
   ▼
TrackService.audio(id)  →  GET /api/tracks/:id/audio  (responseType: 'blob')
   │                        + Authorization: Bearer … (authInterceptor)
   ▼
URL.createObjectURL(blob)  →  Signal `audioUrl`
   │                           (l'URL précédente est révoquée avant)
   ├──▶ [attr.src] de l'<audio>  →  loadedmetadata  →  lecture
   │
   └──▶ AudioEngineService.computePeaks(blob)   (en tâche de fond)
            │  décodage du MÊME Blob, aucune requête de plus
            ▼
         Signal `peaks`  →  <app-waveform>
```

Deux points qui ne se devinent pas :

- **la forme d'onde ne coûte aucune requête supplémentaire** : elle est
  calculée à partir du Blob déjà téléchargé pour la lecture. Le décodage rend
  aussi la durée exacte, utile quand l'élément `<audio>` annonce `Infinity` ;
- l'identifiant de piste est **revérifié à l'arrivée** de l'analyse : elle dure
  quelques centaines de millisecondes, et l'utilisateur peut avoir changé de
  piste entre-temps.

### Le graphe Web Audio

```
<audio> ──▶ MediaElementSource ──▶ lowshelf ──▶ peaking ──▶ highshelf ──▶ Analyser ──▶ sortie
                                    160 Hz      1 kHz       5 kHz          FFT 2048
                                    └──────── égaliseur 3 bandes ────────┘
```

- L'analyseur est branché **sur la sortie** : sans ce dernier maillon, le
  graphe serait complet mais muet.
- Un `AudioContext` démarre « suspendu » tant que l'utilisateur n'a pas
  interagi avec la page : `resume()` est donc appelé depuis un vrai geste.
- Les bandes de fréquence sont regroupées **logarithmiquement** pour
  l'affichage : l'oreille perçoit les hauteurs ainsi, et un regroupement
  linéaire écraserait tout le haut du spectre dans les dernières barres.

---

## 5. Fonctionnalités

### Lecture

| Fonction | Détail |
|---|---|
| **Visualiseur** | trois rendus — spectre en barres (avec témoins de crête qui retombent comme un VU-mètre), oscilloscope, et « sillon » (spectre déroulé en cercle autour du disque) |
| **Forme d'onde** | calculée à partir du fichier déjà téléchargé ; la partie jouée est dans la couleur d'accent ; sert aussi de contrôle de déplacement |
| **File d'attente** | la liste visible au moment du clic devient la file ; ajout à la file sans interrompre la lecture ; retrait ; lecture directe d'une entrée |
| **Aléatoire** | ordre mémorisé (mélange de Fisher-Yates), pas un tirage à chaque piste : toutes passent une fois avant qu'une seule ne repasse, et « précédent » revient sur la bonne |
| **Répétition** | désactivée / la file / la piste. « Répéter la piste » ne s'applique qu'à une fin naturelle : un clic sur « suivant » change vraiment de piste |
| **Boucle A → B** | deux repères pour rejouer un passage en continu, marqués sur la forme d'onde. Un point B à moins d'une demi-seconde du point A est refusé : la lecture resterait bloquée sur place |
| **Vitesse** | 0,5× à 1,5×, avec `preservesPitch` — rien ne se désaccorde quand on ralentit |
| **Égaliseur** | trois bandes, ±12 dB. Creuser les médiums permet de s'entendre jouer par-dessus la piste |
| **Scène plein écran** | grand visualiseur, chronomètre lisible à distance, et tous les outils de travail |
| **Téléchargement** | la piste en cours est déjà en mémoire : aucune requête. Pour une autre piste, le Blob est demandé puis l'URL immédiatement révoquée |

### Bibliothèque

| Fonction | Détail |
|---|---|
| **Pagination serveur** | mode par défaut, conforme au contrat : une requête par changement de page, c'est le serveur qui découpe |
| **Recherche** | sur le titre **et** le nom de fichier d'origine — on se souvient parfois de l'un, parfois de l'autre |
| **Tri** | récentes, anciennes, titre, poids, nombre d'écoutes |
| **Filtres** | format, favoris, étiquette |
| **Import multiple** | plusieurs fichiers déposés d'un coup, envoyés **l'un après l'autre** (l'API n'accepte qu'un fichier par requête), avec barre et message par fichier, et reprise individuelle |
| **Suppression** | confirmation en deux temps dans la ligne ; un second clic est bloqué pendant la requête |
| **Favoris, étiquettes, écoutes** | locaux (voir §7) |
| **Statistiques** | quatre chiffres clés et répartition par format |

#### Pourquoi la recherche charge toute la bibliothèque

Chercher dans la seule page affichée donnerait des résultats **faux** : « rien
trouvé » alors que la piste est page 3. Dès qu'un critère est posé, le store
bascule donc en mode `all` et récupère toutes les pages l'une après l'autre
(`limit=20`, le maximum autorisé par le backend), puis filtre en mémoire.
Quand le dernier critère est retiré, la pagination serveur reprend la main et
le paginator réapparaît.

L'écran dit toujours sur quoi portent les chiffres affichés : « calculé sur la
page affichée (5 pistes sur 37) » ou « sur la bibliothèque complète ».

---

## 6. Raccourcis clavier

Déclarés dans
[`shortcuts-help.ts`](../frontend-starter/src/app/components/shortcuts-help/shortcuts-help.ts)
— l'aide et le code sont côte à côte, donc un raccourci modifié sans mise à
jour de l'aide se voit en revue.

| Touche | Action |
|---|---|
| `Espace`, `K` | lecture / pause |
| `←` `→`, `J` `L` | ± 5 secondes |
| `N` / `P` | piste suivante / précédente |
| `M` | couper / rétablir le son |
| `A` / `B` | poser le début / la fin de la boucle |
| `S` / `R` | aléatoire / mode de répétition |
| `F` | ouvrir / fermer la scène |
| `/` | focus sur la recherche |
| `?` | aide |
| `Échap` | fermer la scène ou l'aide |

Deux garde-fous : **rien** ne se déclenche pendant la saisie dans un champ ni
avec `Ctrl`/`Cmd`/`Alt`, et la barre d'espace est ignorée quand le focus est
sur un bouton ou un curseur, où elle a déjà un sens. Les flèches **haut et
bas** sont laissées au navigateur : les détourner pour le volume casserait le
défilement de la page.

---

## 7. Favoris, étiquettes et écoutes : locaux, et pourquoi

`API_CONTRACT.md` ne prévoit aucune route pour ces informations, et
`backend/` ne doit pas être modifié. Elles sont donc rangées dans
`localStorage` sous une seule clé (`gpc_track_meta`), indexée par identifiant
de piste.

Deux conséquences, **annoncées dans l'interface** (page Profil, section
« Données de ce navigateur ») plutôt que découvertes par l'utilisateur :

- elles ne suivent pas d'un appareil à l'autre ;
- vider les données du site les efface.

Une seule clé suffit : le backend ne renvoie à chacun que ses propres pistes,
donc deux comptes utilisés depuis le même navigateur ne peuvent pas voir les
entrées de l'autre, faute de connaître leurs identifiants. La page Profil
permet d'effacer ces données, et une piste supprimée est oubliée pour ne pas
accumuler des entrées mortes.

Le stockage est relu **avec méfiance** : chaque champ est vérifié plutôt que
supposé, car ces valeurs peuvent avoir été écrites par une version antérieure
ou modifiées à la main dans les outils du navigateur.

---

## 8. Dégradation

L'application reste utilisable quand une capacité du navigateur manque. Ce
n'est pas théorique : c'est exactement ce que vivent les tests, qui tournent
dans jsdom sans Web Audio ni canvas.

| Absent | Conséquence | Ce qui continue |
|---|---|---|
| Web Audio | pas de visualiseur, pas d'égaliseur, pas de forme d'onde | **la lecture**, et la position sur un rail simple |
| Contexte `<canvas>` 2D | rien n'est dessiné | tout le reste |
| `CanvasRenderingContext2D.roundRect` | barres à sommet droit | le spectre |
| `localStorage` | thème et favoris non retenus | la session en cours |
| `crypto.randomUUID` | identifiants locaux de repli | la file d'envoi |
| Décodage impossible du fichier | pas de forme d'onde | la lecture et un rail de progression |

Le visualiseur n'anime **que pendant la lecture** : en pause, une seule image
« au repos » est dessinée, et aucune boucle d'animation ne tourne.

---

## 9. Tests

`npm test` dans `frontend-starter` → **132 tests, 12 fichiers**.

| Fichier | Ce qu'il couvre |
|---|---|
| `shared/services/auth.service.spec.ts` | connexion, inscription, jeton, déconnexion |
| `shared/services/track.service.spec.ts` | les quatre routes de pistes et leurs options |
| `shared/services/library.store.spec.ts` | pagination, bornage serveur, recherche globale, filtres, tri, suppression locale |
| `shared/services/player.service.spec.ts` | Blob et ObjectURL, file, aléatoire, répétition, boucle A→B, volume, vitesse |
| `shared/services/upload-queue.service.spec.ts` | validation locale, envoi séquentiel, progression, erreurs, reprise |
| `shared/services/track-meta.service.spec.ts` | persistance, normalisation des étiquettes, stockage abîmé |
| `shared/formatting.spec.ts` | fonctions d'affichage pures |
| `shared/interceptors/auth.interceptor.spec.ts` | en-tête `Authorization` |
| `shared/guards/auth.guard.spec.ts` | accès aux routes protégées |
| `components/tracks-page.spec.ts` | assemblage de la page, suppression, téléchargement, raccourci `/` |
| `components/player-bar.spec.ts` | état vide, `<audio>` unique et sans `src`, favori, boucle, accessibilité |
| `components/app.spec.ts` | raccourcis globaux, bascule de thème, scène, déconnexion |

Aucun de ces tests n'a besoin de MongoDB ni du backend :
`provideHttpClientTesting` remplace le transport HTTP par un faux transport
que le test pilote.

Le backend, **non modifié**, garde ses 11 tests (`npm test` dans `backend`).
