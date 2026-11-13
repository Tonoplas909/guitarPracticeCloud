# Direction artistique « Sillon »

Charte graphique de Guitar Practice Cloud. Ce document est la référence : toute
valeur de couleur, de taille ou d'espacement utilisée dans l'application y est
déclarée, et le code ne doit contenir aucune valeur en dur qui ne s'y trouve
pas.

Fichier d'implémentation unique : [`frontend-starter/src/styles.css`](../frontend-starter/src/styles.css).
Les CSS de composants ne consomment que ses variables.

---

## 1. Intention

L'application sert à **ranger et travailler des fichiers audio**. Le site doit
donc se comporter comme une archive : on y cherche, on y classe, on y revient.
D'où le parti pris :

> **Du papier, de l'encre, et des détails d'instrument.**

- Le fond est un **papier chaud**, pas un gris neutre ni un noir d'écran.
- L'accent est un **vermillon de tampon encreur** : la couleur d'un cachet
  apposé sur une fiche, utilisée avec parcimonie.
- Les chiffres (chronomètres, tailles, compteurs) sont en **monospace**, comme
  sur un appareil de mesure.
- Les titres sont en **serif à fort contraste** (Fraunces) : la voix
  éditoriale d'une revue, pas celle d'un tableau de bord.
- Le décor est **matière et non lumière** : grain de papier et sillons de
  disque, jamais de halo ni de néon.

### Pourquoi ce changement

La version précédente était un thème « synthwave » : fond violet nuit, néons
rose et cyan, grille en perspective animée, titres en Orbitron. Le décor
occupait le premier plan, les aplats fluo entraient en concurrence avec les
états de l'interface (une piste en lecture ne pouvait plus être signalée par la
couleur, tout l'était déjà), et le thème unique sombre ignorait les
utilisateurs qui travaillent en plein jour.

La nouvelle charte inverse la hiérarchie : **le décor se tait, le contenu
parle**, et une seule couleur vive reste disponible pour dire ce qui compte.

---

## 2. Deux thèmes

| | « Jour » | « Nuit » |
|---|---|---|
| Rôle | défaut | lecture le soir |
| Fond | papier `#f3ede1` | encre `#14110d` |
| Surface | `#fffdf8` | `#1e1a15` |
| Accent | vermillon `#c0391c` | vermillon éclairci `#ff6f45` |

Le thème « Nuit » n'est **pas une inversion automatique** : chacune de ses
valeurs a été choisie puis mesurée sur sa propre surface. Les deux restent des
papiers teintés — le sombre est brun-noir, jamais bleu-gris.

### Mécanisme

1. L'attribut `data-theme="jour" | "nuit"` sur `<html>` porte un choix
   explicite. Sans attribut, le CSS suit `prefers-color-scheme`.
2. [`ThemeService`](../frontend-starter/src/app/shared/services/theme.service.ts)
   est la source de vérité pendant la session et persiste le choix dans
   `localStorage` (`gpc_theme`).
3. Un script de six lignes dans
   [`index.html`](../frontend-starter/src/index.html) applique la valeur
   stockée **avant le premier rendu**. Sans lui, la page s'afficherait une
   fraction de seconde en thème clair avant que Angular ne démarre — un flash
   blanc désagréable le soir.
4. Les trois états (`jour`, `nuit`, `auto`) sont réglables depuis le panneau
   d'aide (touche `?`) et depuis la page Profil. La bascule de la barre de
   titre ne fait qu'alterner jour/nuit.

Conséquence pour le code : **aucune couleur ne doit être définie uniquement
dans un bloc `@media (prefers-color-scheme: dark)`**. Les jetons sont déclarés
sur `:root` nu, puis redéfinis dans le bloc média *et* sous
`:root[data-theme="nuit"]`, pour que le choix de l'utilisateur gagne dans les
deux sens.

---

## 3. Couleurs et contrastes mesurés

Toutes les valeurs ci-dessous sont des rapports WCAG calculés, pas des
estimations. Seuils : **4,5:1** pour du texte courant, **3:1** pour du texte
large et les éléments d'interface.

### Thème « Jour »

| Jeton | Valeur | Sur `--bg` | Sur `--surface` | Usage |
|---|---|---|---|---|
| `--ink` | `#1b1713` | 15,3:1 | 17,5:1 | texte principal |
| `--ink-muted` | `#5a5147` | 6,7:1 | 7,6:1 | texte secondaire |
| `--ink-faint` | `#6f6454` | 5,0:1 | 5,7:1 | libellés, métadonnées |
| `--accent` | `#c0391c` | 4,7:1 | 5,4:1 | action principale, état actif |
| `--accent-2` | `#007568` | 4,8:1 | 5,5:1 | étiquettes, repères de boucle |
| `--ok` | `#0a6e45` | — | 6,2:1 | succès |
| `--danger` | `#b3261e` | — | 6,4:1 | erreur, suppression |

Texte sur l'accent : `--accent-ink` `#fffdf8` sur `#c0391c` → **5,4:1**.

### Thème « Nuit »

| Jeton | Valeur | Sur `--bg` | Sur `--surface` |
|---|---|---|---|
| `--ink` | `#f4ecdd` | 16,0:1 | 14,7:1 |
| `--ink-muted` | `#b5a992` | — | 7,5:1 |
| `--ink-faint` | `#9a8e79` | 5,8:1 | 5,4:1 |
| `--accent` | `#ff6f45` | 6,8:1 | 6,3:1 |
| `--accent-2` | `#35c3ad` | — | 7,9:1 |
| `--ok` | `#4ec98a` | — | 8,3:1 |
| `--danger` | `#ff6b6b` | — | 6,2:1 |

Texte sur l'accent : `--accent-ink` `#1b1004` sur `#ff6f45` → **6,8:1**.

### Palette catégorielle des formats audio

Le graphique de répartition par format porte quatre séries. Sa palette est
**validée par calcul** et non à l'œil, sur chacune des deux surfaces :

| Format | Jeton | Jour | Nuit |
|---|---|---|---|
| MP3 | `--fmt-1` | `#c0391c` | `#e8552b` |
| WAV | `--fmt-2` | `#00897a` | `#19a08c` |
| OGG | `--fmt-3` | `#5a4ab8` | `#8878e8` |
| M4A | `--fmt-4` | `#a97012` | `#c08a1e` |

Résultats des cinq contrôles calculables (bande de clarté OKLCH, plancher de
chroma, séparation sous protanopie/deutéranopie en ΔE OKLab, plancher en
vision normale, contraste sur la surface) :

| | Jour (surface `#fffdf8`) | Nuit (surface `#1e1a15`) |
|---|---|---|
| Bande de clarté | ✅ | ✅ |
| Plancher de chroma | ✅ | ✅ |
| Séparation daltonisme | ✅ pire paire ΔE 12,0 | ✅ pire paire ΔE 13,4 |
| Vision normale | ✅ pire paire ΔE 22,8 | ✅ pire paire ΔE 22,4 |
| Contraste ≥ 3:1 | ✅ | ✅ |

Trois règles non négociables sur cette palette :

1. **L'ordre est fixe** (MP3, WAV, OGG, M4A), déclaré une fois dans
   [`audio-constraints.ts`](../frontend-starter/src/app/shared/audio-constraints.ts).
   Une couleur suit le format, **jamais son rang** : sans cela, un filtre qui
   retire un format repeindrait les autres et le lecteur perdrait le repère
   qu'il vient d'apprendre.
2. **Ces teintes ne servent jamais de couleur de texte** — uniquement de
   marques (pastilles, parts de barre). Les libellés portent les jetons
   d'encre ; l'identité vient de la pastille posée à côté.
3. **La légende est toujours présente** et donne nom, nombre et pourcentage :
   elle tient aussi le rôle de vue tabulaire, donc l'information n'est jamais
   portée par la seule couleur.

---

## 4. Typographie

Trois familles, trois rôles — jamais plus.

| Rôle | Famille | Usage |
|---|---|---|
| Titraille | **Fraunces** (serif variable) | `h1`, `h2`, logotype, avatar, affiche |
| Texte | **Inter** | tout le reste, y compris les chiffres vedettes |
| Chiffre | **JetBrains Mono** | chronomètres, compteurs, tailles, touches clavier, surtitres |

Fraunces est une fonte variable : ses axes sont fixés une fois
(`font-variation-settings: 'SOFT' 0, 'WONK' 0, 'opsz' 48`) pour un rendu
stable. L'axe `WONK` n'est relevé qu'à un seul endroit, le titre de l'affiche
des pages de connexion.

**Les valeurs de données restent en Inter**, y compris le chiffre vedette du
tableau de bord : un nombre en serif de titrage se lit comme une décoration et
non comme une donnée. Le serif porte la voix éditoriale, pas les mesures.

`font-variant-numeric: tabular-nums` (classe `.num`) est réservé aux colonnes
de chiffres et aux chronomètres, où les caractères doivent s'aligner
verticalement et ne pas trembler. Les grands nombres isolés gardent les
chiffres proportionnels : à cette taille, une largeur fixe paraît espacée.

### Échelle

| Jeton | Taille | Usage |
|---|---|---|
| `--step--2` | 11 px | puces, surtitres, touches |
| `--step--1` | 13 px | texte secondaire, boutons |
| `--step-0` | 15 px | base |
| `--step-1` | 17 px | nom de marque, identité |
| `--step-2` | 20 px | valeur de tuile |
| `--step-3` | 22 → 28 px | `h2` |
| `--step-4` | 30 → 48 px | `h1` |

Les deux derniers niveaux sont fluides (`clamp`) : ils rétrécissent avec la
fenêtre sans point de rupture visible.

---

## 5. Formes, espace, profondeur

- **Rythme unique de 4 px** : `--sp-1` (4 px) à `--sp-7` (48 px). Aucune
  marge ne s'écrit en pixels dans les composants.
- **Angles presque droits** : `--r-xs` 3 px, `--r-sm` 6 px, `--r` 10 px,
  `--r-lg` 16 px. Le `--r-pill` est **réservé aux puces d'information** et aux
  rails de curseur — pas aux boutons, qui restent rectangulaires comme une
  étiquette collée.
- **Séparations au filet** : un trait de 1 px (`--line`) plutôt qu'une ombre.
  Les blocs sont posés sur le papier, ils ne flottent pas.
- **Ombres d'impression** : décalage court et sombre (`--shadow-1` à
  `--shadow-3`), jamais de halo coloré. Une seule ombre forte dans toute
  l'application, celle de la scène plein écran.

### Décor

Deux pseudo-éléments fixes sur `body`, strictement décoratifs
(`pointer-events: none`) :

- **le grain** : un bruit SVG (`feTurbulence`) en data-URI, en
  `mix-blend-mode: multiply` le jour et `screen` la nuit. Aucune requête
  réseau, et il casse l'aspect « aplat numérique » des grandes surfaces ;
- **les sillons** : des cercles concentriques très pâles en haut à droite,
  comme un disque posé sous la page.

---

## 6. Composants

| Classe / composant | Rôle |
|---|---|
| `.sheet` | la brique de base : une feuille de papier posée |
| `.btn` + `.btn-primary` / `.btn-quiet` / `.btn-danger` / `.btn-sm` | boutons. **Aucun style n'est imposé à `button` nu**, car les composants Angular Material en contiennent et doivent garder le leur |
| `.icon-btn` + `.is-on` | bouton icône carré, brique du transport du lecteur |
| `.chip` | puce d'information (format, taille, date) |
| `.notice` + `.notice-error` / `.notice-ok` | messages |
| `.eyebrow`, `.lede`, `.rule`, `.num` | registres typographiques |
| `kbd` | touche clavier imprimée |
| `app-icon` | jeu d'icônes au trait de 1,7 px, déclaré en TypeScript — aucune fonte d'icônes, aucun sprite à télécharger |

### Angular Material

Le thème préfabriqué `azure-blue.css` est un thème **clair** sans aucune règle
`prefers-color-scheme`, mais entièrement piloté par des jetons `--mat-sys-*`.
`styles.css` les réécrit donc dans les deux thèmes. Jetons relevés dans les
bundles des trois composants réellement utilisés :

| Composant | Jetons lus |
|---|---|
| SnackBar | `inverse-surface`, `inverse-on-surface`, `inverse-primary` |
| Paginator (et son `mat-select`) | `surface`, `on-surface`, `on-surface-variant`, `surface-container`, `primary`, `outline` |
| ProgressBar | `primary`, `surface-variant` |

Le SnackBar reste volontairement **clair sur fond sombre** (et inversement) :
c'est la convention Material 3 de la surface « inversée », et cela le rend
immédiatement repérable.

---

## 7. Mouvement

Quatre animations dans toute l'application, et c'est tout :

| Animation | Durée | Raison |
|---|---|---|
| Le disque de la pochette tourne | 8 s / tour | signale la lecture sans texte |
| Le disque de la scène tourne | 14 s / tour | idem, en grand |
| Le logotype pivote au survol | 0,4 s | un seul clin d'œil dans le site |
| Voile et montée de la scène | 0,18 / 0,22 s | ancrage de la modale |

Plus l'égaliseur animé à trois barres qui marque la piste en cours, et le
chatoiement des squelettes de chargement.

`@media (prefers-reduced-motion: reduce)` neutralise **tout** : animations,
transitions et défilement animé.

---

## 8. Accessibilité

Règles tenues dans toute l'interface :

- **Aucune information portée par la seule couleur.** La piste en cours a un
  filet d'accent, un fond teinté *et* un badge textuel ; un favori est un cœur
  **plein ou vide** ; les bascules portent `aria-pressed` ; la boucle A→B a une
  bande colorée *et* une puce avec ses deux chronomètres.
- **Anneau de focus visible** sur tout élément interactif
  (`:focus-visible`, 2 px d'accent), y compris sur la zone de dépôt via
  `:focus-within`, puisque son `<input type="file">` est masqué.
- **Lien d'évitement** en première cible de tabulation.
- La forme d'onde est un `<canvas>`, donc ni focalisable ni annonçable : son
  élément hôte porte `role="slider"` avec `aria-valuenow`/`aria-valuetext`, et
  répond aux flèches, `Page↑/↓`, `Début` et `Fin`.
- Les deux modales (scène, aide) portent `role="dialog"` et
  `aria-modal="true"`, déplacent le focus à l'ouverture et se ferment par
  `Échap`.
- Les icônes sont décoratives (`aria-hidden`) ; chaque bouton icônique porte un
  `aria-label` **qui suit son état** (« Mettre en pause » / « Reprendre la
  lecture »).
- Les zones qui changent seules sont annoncées : `aria-live="polite"` sur la
  file d'envoi, `role="status"` sur les états de chargement, `role="alert"` sur
  les erreurs.
- Les contrastes sont ceux mesurés en section 3 — tous au-dessus de AA.

---

## 9. Adaptation aux petits écrans

Points de rupture effectivement utilisés :

| Largeur | Ce qui change |
|---|---|
| 1140 px | la barre de lecture masque vitesse et puce de boucle |
| 1080 px | l'en-tête de la bibliothèque passe sur une colonne |
| 1000 px | les chiffres d'une ligne de piste passent sous son titre |
| 980 px | le panneau d'import quitte la colonne latérale et cesse d'être collant |
| 920 px | la scène et le profil passent sur une colonne |
| 900 px | la barre de lecture passe sur deux lignes (forme d'onde en haut) ; `--player-h` passe de 76 à 104 px ; l'affiche des pages de connexion disparaît |
| 860 px | l'en-tête réduit la marque à son nom et la navigation à ses icônes |
| 620 px | les actions d'une ligne de piste passent sur leur propre ligne |

La classe `.secondary` marque, dans la barre de lecture, **tout ce qui peut
disparaître** quand la place manque. Les commandes essentielles — piste,
lecture, position — ne sont jamais masquées.

**Hauteur du lecteur** : la barre est en `position: fixed`, donc hors flux.
Sa hauteur est déclarée une seule fois (`--player-h`) et réservée par le
`padding-bottom` de `main`. Sans cela, le dernier élément de chaque page
finirait sous la barre.

---

## 10. Où modifier quoi

| Pour changer… | Fichier |
|---|---|
| une couleur, une taille, un espacement | `src/styles.css` (sections 1 à 3) |
| les jetons Material | `src/styles.css` (section 10) |
| les polices | `src/index.html` + `--font-*` dans `styles.css` |
| le grain ou les sillons | `styles.css`, `body::before` / `body::after` |
| une icône | `src/app/components/icon/icon.ts` |
| les couleurs de graphique | `--fmt-1` à `--fmt-4`, **et** revalider la palette |
| le favicon ou la teinte de barre d'adresse | `src/index.html` |
