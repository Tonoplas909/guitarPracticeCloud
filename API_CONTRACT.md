# Contrat HTTP

Base : `/api`. Sauf inscription et connexion, envoyer `Authorization: Bearer <token>`.

Le contrat HTTP ne dépend pas du choix de persistance : le backend fourni utilise Mongoose et MongoDB. MongoDB conserve les utilisateurs et métadonnées ; les octets des fichiers audio restent sur le disque du serveur.

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/health` | - | `{ "status": "ok" }` |
| POST | `/auth/register` | `{name,email,password}` | `201 {token,user}` |
| POST | `/auth/login` | `{email,password}` | `200 {token,user}` |
| GET | `/users/me` | JWT | `200 User` |
| PUT | `/users/me` | `{name}` + JWT | `200 User` |
| GET | `/tracks?page=1&limit=5` | JWT | `Page<Track>` |
| POST | `/tracks` | multipart : `audio`, `title` | `201 Track` |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| DELETE | `/tracks/:id` | JWT | `204` (bonus) |

`Page<Track>` contient `items`, `page`, `limit`, `total` et `pages`. Formats acceptés : MP3, WAV, OGG et M4A, 25 Mo maximum.

Erreurs courantes : `400` validation, `401` authentification, `404` ressource, `409` email déjà utilisé.

## Ce que le frontend ajoute sans toucher au contrat

Le frontend n'utilise **que** les routes ci-dessus : aucune n'a été ajoutée,
retirée ni modifiée. Les fonctions qui n'ont pas de route sont donc assurées
côté client, et c'est un choix assumé, pas un oubli :

| Fonction | Comment, faute de route |
|---|---|
| Favoris, étiquettes, compteurs d'écoute | enregistrés dans le `localStorage` du navigateur (clé `gpc_track_meta`). Non partagés entre appareils — l'interface le dit dans la page Profil |
| Recherche, tri et filtres sur toute la bibliothèque | le client récupère toutes les pages (`GET /tracks?page=N&limit=20`) puis filtre en mémoire. Filtrer la seule page affichée donnerait un résultat faux |
| Import de plusieurs fichiers | `POST /tracks` n'accepte qu'un fichier (`upload.single("audio")`) : le lot est découpé côté client et envoyé séquentiellement, une requête par fichier |
| Forme d'onde | calculée par décodage du Blob **déjà** téléchargé par `GET /tracks/:id/audio`. Aucune requête supplémentaire |
| Téléchargement d'une piste | le flux étant protégé par le JWT, il passe par `HttpClient` puis par une `ObjectURL` locale — un `<a href="/api/…">` partirait sans en-tête `Authorization` |

Il n'existe pas de route pour renommer une piste (`PUT /tracks/:id`) :
l'interface ne propose donc pas de renommage, plutôt qu'un faux renommage qui
ne serait visible que sur un seul navigateur.
