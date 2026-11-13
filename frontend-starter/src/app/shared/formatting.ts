/*
 * Fonctions d'affichage pures, sans dépendance à Angular.
 *
 * Elles sont regroupées hors des composants pour deux raisons : plusieurs
 * composants affichent les mêmes valeurs (un chronomètre apparaît dans la
 * barre de lecture ET dans la scène), et une fonction pure se teste sans
 * monter de composant.
 */

/**
 * Formate des secondes en `m:ss`, ou `h:mm:ss` au-delà d'une heure.
 *
 * Un Blob de durée inconnue donne `Infinity` ou `NaN` : on affiche alors
 * `0:00` plutôt que « NaN », car cela arrive réellement avant que
 * l'événement `loadedmetadata` n'ait renseigné la durée.
 */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';

  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, '0');

  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${rest}`;
  return `${minutes}:${rest}`;
}

/** Formate une date ISO renvoyée par l'API en date courte française. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Date relative courte (« aujourd'hui », « il y a 3 j »), utilisée pour la
 * dernière écoute. Au-delà d'un mois, la date absolue est plus parlante.
 */
export function formatRelativeDate(iso: string | null): string {
  if (!iso) return 'jamais';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'jamais';

  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 31) return `il y a ${days} j`;
  return formatDate(iso);
}

/**
 * Abrège un total pour une tuile de statistique (1 284 → 1,3 k).
 * Les grands nombres bruts sont illisibles dans un chiffre vedette.
 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(1).replace('.', ',')} k`;
  return `${(value / 1_000_000).toFixed(1).replace('.', ',')} M`;
}

/** Durée longue lisible (« 12 min 30 s »), pour les totaux cumulés. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';

  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);

  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')}`;
  if (minutes > 0) return `${minutes} min`;
  return `${whole} s`;
}

/**
 * Vitesse de lecture à la française : virgule décimale, signe multiplier, et
 * pas de zéro inutile — « 1× » plutôt que « 1,00× », « 0,75× » tel quel.
 */
export function formatRate(rate: number): string {
  const trimmed = rate.toFixed(2).replace(/\.?0+$/, '');
  return `${trimmed.replace('.', ',')}×`;
}
