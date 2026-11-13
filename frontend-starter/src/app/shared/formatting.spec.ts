import { describe, it, expect } from 'vitest';
import {
  formatCount,
  formatDate,
  formatDuration,
  formatRate,
  formatRelativeDate,
  formatTime,
} from './formatting';

/*
 * Des fonctions pures : aucun composant à monter, aucune requête à simuler.
 * C'est précisément pourquoi elles ont été sorties des composants — un
 * chronomètre s'affiche dans la barre de lecture ET dans la scène, et une
 * fonction pure se teste en une ligne.
 */
describe('formatTime', () => {
  it('rend des durées lisibles', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9)).toBe('0:09');
    expect(formatTime(75.4)).toBe('1:15');
    expect(formatTime(600)).toBe('10:00');
  });

  it('passe en heures au-delà de soixante minutes', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3725)).toBe('1:02:05');
  });

  it('n’affiche jamais « NaN »', () => {
    // Un Blob de durée inconnue renvoie NaN ou Infinity : cela arrive
    // réellement avant que `loadedmetadata` n'ait renseigné la durée.
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(formatTime(-5)).toBe('0:00');
  });
});

describe('formatDate', () => {
  it('formate une date ISO en français', () => {
    expect(formatDate('2026-01-15T10:00:00.000Z')).toContain('2026');
  });

  it('ne casse pas sur une date invalide', () => {
    expect(formatDate('pas-une-date')).toBe('—');
  });
});

describe('formatRelativeDate', () => {
  it('traduit l’absence d’écoute', () => {
    expect(formatRelativeDate(null)).toBe('jamais');
    expect(formatRelativeDate('pas-une-date')).toBe('jamais');
  });

  it('rend les dates proches en relatif', () => {
    expect(formatRelativeDate(new Date().toISOString())).toBe("aujourd'hui");

    const hier = new Date(Date.now() - 86_400_000).toISOString();
    expect(formatRelativeDate(hier)).toBe('hier');

    const semaine = new Date(Date.now() - 5 * 86_400_000).toISOString();
    expect(formatRelativeDate(semaine)).toBe('il y a 5 j');
  });

  it('repasse en date absolue au-delà d’un mois', () => {
    const vieux = new Date(Date.now() - 60 * 86_400_000).toISOString();

    expect(formatRelativeDate(vieux)).not.toContain('il y a');
  });
});

describe('formatCount', () => {
  it('laisse les petits nombres tels quels', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
  });

  it('abrège les grands nombres avec la virgule française', () => {
    expect(formatCount(1284)).toBe('1,3 k');
    expect(formatCount(2_500_000)).toBe('2,5 M');
  });
});

describe('formatDuration', () => {
  it('rend un total cumulé lisible', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(90)).toBe('1 min');
    expect(formatDuration(3700)).toBe('1 h 01');
  });

  it('rend un tiret pour une durée inconnue', () => {
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
  });
});

describe('formatRate', () => {
  it('utilise la virgule et le signe multiplier', () => {
    expect(formatRate(1)).toBe('1×');
    expect(formatRate(0.75)).toBe('0,75×');
    expect(formatRate(1.5)).toBe('1,5×');
  });
});
